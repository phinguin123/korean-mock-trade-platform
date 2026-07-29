import WebSocket from 'ws';
import { config } from '../config';
import { MarketDataStore } from '../store/MarketDataStore';
import { OrderBook, OrderBookLevel, Tick, TradeSide } from '../types/market';

/**
 * Common contract every market data ingestion source must satisfy. The rest
 * of the system (MatchingEngine, Broadcaster) only ever depends on
 * `MarketDataStore` being kept up to date - it never talks to an adapter
 * directly - so swapping the mock simulator for the real Kiwoom feed is a
 * one-line change in `server.ts`.
 */
export interface MarketDataAdapter {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Mock Market Simulator
// ---------------------------------------------------------------------------

interface MockSimulatorOptions {
  symbol: string;
  name: string;
  basePrice: number;
  tickIntervalMs: number;
  volatilityBps: number; // basis points (1 bps = 0.01%) of max move per tick
}

/**
 * Generates fast, realistic-looking price ticks and a synthetic order book
 * for local development / load testing when the Kiwoom feed is unavailable.
 *
 * Price model: bounded random walk (geometric-ish) so the price drifts
 * smoothly instead of jumping erratically, plus an occasional larger "print"
 * to simulate block trades.
 */
export class MockMarketSimulator implements MarketDataAdapter {
  public readonly name = 'MockMarketSimulator';

  private readonly symbol: string;
  private readonly displayName: string;
  private readonly tickIntervalMs: number;
  private readonly volatilityBps: number;

  private price: number;
  private tickHandle: NodeJS.Timeout | null = null;
  private bookHandle: NodeJS.Timeout | null = null;
  private running = false;

  constructor(opts: MockSimulatorOptions) {
    this.symbol = opts.symbol;
    this.displayName = opts.name;
    this.price = opts.basePrice;
    this.tickIntervalMs = Math.max(20, opts.tickIntervalMs);
    this.volatilityBps = Math.max(1, opts.volatilityBps);
  }

  public async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    MarketDataStore.initSymbol(this.symbol, this.displayName, this.price);
    this.seedOrderBook();

    this.tickHandle = setInterval(() => this.emitTick(), this.tickIntervalMs);
    // Order book refreshes slightly less often than the tape to look natural
    // while still keeping bid/ask levels tracking the last traded price.
    this.bookHandle = setInterval(() => this.emitOrderBook(), Math.max(150, this.tickIntervalMs * 2));

    // eslint-disable-next-line no-console
    console.log(
      `[MockMarketSimulator] started for ${this.symbol} @ ${this.price} (interval=${this.tickIntervalMs}ms)`,
    );
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.tickHandle) clearInterval(this.tickHandle);
    if (this.bookHandle) clearInterval(this.bookHandle);
    this.tickHandle = null;
    this.bookHandle = null;
  }

  private randomWalkStep(): number {
    // Max absolute move per tick = price * (volatilityBps / 10_000)
    const maxMove = this.price * (this.volatilityBps / 10_000);
    // Occasionally (5%) simulate a larger momentum burst
    const burst = Math.random() < 0.05 ? 3 : 1;
    return (Math.random() * 2 - 1) * maxMove * burst;
  }

  private emitTick(): void {
    const previous = this.price;
    const rawNext = previous + this.randomWalkStep();
    const next = this.roundToTick(Math.max(1, rawNext));
    this.price = next;

    // Ticks that move price up print as BUY (aggressor lifted the offer),
    // down as SELL; flat prints alternate randomly to keep the tape varied.
    const side: TradeSide =
      next > previous ? 'BUY' : next < previous ? 'SELL' : Math.random() > 0.5 ? 'BUY' : 'SELL';
    const volume = Math.max(1, Math.round(Math.random() * 50));

    const tick: Tick = {
      price: next,
      volume,
      timestamp: Date.now(),
      side,
    };

    MarketDataStore.applyTick(this.symbol, tick);
  }

  private emitOrderBook(): void {
    const state = MarketDataStore.getState(this.symbol);
    const mid = state?.currentPrice ?? this.price;
    const tickSize = this.tickSizeFor(mid);

    const bids: OrderBookLevel[] = [];
    const asks: OrderBookLevel[] = [];

    for (let i = 1; i <= 10; i += 1) {
      bids.push({
        price: this.roundToTick(mid - tickSize * i),
        volume: Math.max(1, Math.round(Math.random() * 2000 * (1 - i * 0.06))),
      });
      asks.push({
        price: this.roundToTick(mid + tickSize * i),
        volume: Math.max(1, Math.round(Math.random() * 2000 * (1 - i * 0.06))),
      });
    }

    const book: OrderBook = { bids, asks };
    MarketDataStore.updateOrderBook(this.symbol, book);
  }

  private seedOrderBook(): void {
    this.emitOrderBook();
  }

  /** KRX-style tick size table (simplified) so prices look realistic. */
  private tickSizeFor(price: number): number {
    if (price < 2000) return 1;
    if (price < 5000) return 5;
    if (price < 20000) return 10;
    if (price < 50000) return 50;
    if (price < 200000) return 100;
    if (price < 500000) return 500;
    return 1000;
  }

  private roundToTick(price: number): number {
    const tickSize = this.tickSizeFor(price);
    return Math.round(price / tickSize) * tickSize;
  }
}

// ---------------------------------------------------------------------------
// Kiwoom REST/WebSocket Adapter
// ---------------------------------------------------------------------------
//
// Kiwoom retired the legacy 32-bit OCX "OpenAPI+" in favor of a
// cross-platform REST + WebSocket API (https://openapi.kiwoom.com):
//
//   1. Auth:      POST {REST_BASE}/oauth2/token
//                 body: { grant_type: "client_credentials", appkey, secretkey }
//                 -> { token, expires_dt, ... }
//
//   2. Real-time: wss://{host}:10000/api/dostk/websocket
//                 -> send { trnm: "LOGIN", token }
//                 -> on login ack, send { trnm: "REG", grp_no, refresh, data: [...] }
//                    to subscribe to real-time types per symbol, e.g.
//                    "0B" (주식체결 / stock execution) and
//                    "0D" (주식호가잔량 / stock order book & volume).
//                 -> server pushes { trnm: "PING" } periodically; client must
//                    echo it back verbatim to keep the connection alive.
//
// Exact field names inside each TR payload are documented per-TR in the
// Kiwoom developer portal and can change between API revisions, so this
// adapter isolates that parsing behind `mapExecutionPayload` /
// `mapOrderBookPayload`. Fill those in against your issued app key's actual
// response shape before going live; the framework (auth, reconnect,
// heartbeat, subscription bookkeeping) is production-ready as-is.
// ---------------------------------------------------------------------------

interface KiwoomAdapterOptions {
  symbols: string[];
  symbolNames: Record<string, string>;
  restBaseUrl: string;
  wsUrl: string;
  appKey: string;
  appSecret: string;
}

interface KiwoomTokenResponse {
  token: string;
  token_type?: string;
  expires_dt?: string;
}

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30_000;

export class KiwoomAdapter implements MarketDataAdapter {
  public readonly name = 'KiwoomAdapter';

  private readonly opts: KiwoomAdapterOptions;
  private ws: WebSocket | null = null;
  private accessToken: string | null = null;
  private running = false;
  private reconnectAttempts = 0;
  private reconnectHandle: NodeJS.Timeout | null = null;

  constructor(opts: KiwoomAdapterOptions) {
    if (!opts.appKey || !opts.appSecret) {
      throw new Error(
        'KiwoomAdapter requires KIWOOM_APP_KEY and KIWOOM_APP_SECRET to be set. ' +
          'Set MARKET_DATA_SOURCE=mock to run without live credentials.',
      );
    }
    this.opts = opts;
  }

  public async start(): Promise<void> {
    this.running = true;
    for (const symbol of this.opts.symbols) {
      const name = this.opts.symbolNames[symbol] ?? symbol;
      // Seed at 0 until the first real tick arrives; the store will be
      // overwritten immediately once ingestion begins.
      if (!MarketDataStore.hasSymbol(symbol)) {
        MarketDataStore.initSymbol(symbol, name, 0);
      }
    }

    await this.authenticate();
    await this.connectWebSocket();
  }

  public async stop(): Promise<void> {
    this.running = false;
    if (this.reconnectHandle) clearTimeout(this.reconnectHandle);
    this.ws?.close();
    this.ws = null;
  }

  /** Fetches (and caches) an OAuth2 access token via client-credentials grant. */
  private async authenticate(): Promise<void> {
    const url = `${this.opts.restBaseUrl}/oauth2/token`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        appkey: this.opts.appKey,
        secretkey: this.opts.appSecret,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '<unreadable body>');
      throw new Error(`Kiwoom OAuth2 token request failed (${response.status}): ${body}`);
    }

    const data = (await response.json()) as KiwoomTokenResponse;
    if (!data.token) {
      throw new Error('Kiwoom OAuth2 response did not include a token field.');
    }
    this.accessToken = data.token;
    // eslint-disable-next-line no-console
    console.log('[KiwoomAdapter] authenticated, token acquired.');
  }

  private async connectWebSocket(): Promise<void> {
    if (!this.running) return;

    const ws = new WebSocket(this.opts.wsUrl);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempts = 0;
      // eslint-disable-next-line no-console
      console.log('[KiwoomAdapter] websocket connected, sending LOGIN.');
      ws.send(JSON.stringify({ trnm: 'LOGIN', token: this.accessToken }));
    });

    ws.on('message', (raw) => this.handleMessage(raw));

    ws.on('error', (err) => {
      // eslint-disable-next-line no-console
      console.error('[KiwoomAdapter] websocket error:', err.message);
    });

    ws.on('close', () => {
      // eslint-disable-next-line no-console
      console.warn('[KiwoomAdapter] websocket closed.');
      this.ws = null;
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (!this.running) return;
    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
    );
    this.reconnectAttempts += 1;
    // eslint-disable-next-line no-console
    console.log(`[KiwoomAdapter] reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectHandle = setTimeout(() => {
      this.authenticate()
        .then(() => this.connectWebSocket())
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[KiwoomAdapter] reconnect failed:', err);
          this.scheduleReconnect();
        });
    }, delay);
  }

  private handleMessage(raw: WebSocket.RawData): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const trnm = payload.trnm as string | undefined;

    switch (trnm) {
      case 'PING':
        // Heartbeat: echo the frame back verbatim to keep the socket alive.
        this.ws?.send(JSON.stringify(payload));
        return;

      case 'LOGIN':
        this.onLoginAck(payload);
        return;

      case 'REAL':
        this.onRealtimePush(payload);
        return;

      default:
        // Unhandled/administrative frame (e.g. REG ack) - safe to ignore.
        return;
    }
  }

  private onLoginAck(payload: Record<string, unknown>): void {
    const ok = (payload.return_code as number | undefined) === 0 || payload.return_code === undefined;
    if (!ok) {
      // eslint-disable-next-line no-console
      console.error('[KiwoomAdapter] LOGIN rejected:', payload);
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[KiwoomAdapter] LOGIN acknowledged, subscribing to symbols.');
    this.subscribeToSymbols();
  }

  private subscribeToSymbols(): void {
    const registration = {
      trnm: 'REG',
      grp_no: '1',
      refresh: '1',
      data: [
        {
          item: this.opts.symbols,
          type: ['0B', '0D'], // 0B = 주식체결(execution), 0D = 주식호가잔량(order book)
        },
      ],
    };
    this.ws?.send(JSON.stringify(registration));
  }

  /**
   * Real-time push frames (`trnm: "REAL"`) bundle one or more `data` entries,
   * each tagged with a real-time type (`type`) and item code (`item`).
   * `values` holds the TR-specific field map (FID -> string value) as
   * documented per real-time type in the Kiwoom developer portal.
   */
  private onRealtimePush(payload: Record<string, unknown>): void {
    const entries = (payload.data as Array<Record<string, unknown>> | undefined) ?? [];

    for (const entry of entries) {
      const type = entry.type as string | undefined;
      const symbol = entry.item as string | undefined;
      const values = (entry.values as Record<string, string> | undefined) ?? {};
      if (!symbol) continue;

      if (!MarketDataStore.hasSymbol(symbol)) {
        MarketDataStore.initSymbol(symbol, this.opts.symbolNames[symbol] ?? symbol, 0);
      }

      if (type === '0B') {
        const tick = this.mapExecutionPayload(values);
        if (tick) MarketDataStore.applyTick(symbol, tick);
      } else if (type === '0D') {
        const book = this.mapOrderBookPayload(values);
        if (book) MarketDataStore.updateOrderBook(symbol, book);
      }
    }
  }

  /**
   * Maps a raw "주식체결" (0B) field map to a normalized Tick.
   * NOTE: fill in the actual FID keys from your Kiwoom TR spec - the keys
   * below (`10`=price, `15`=volume, `25`=change sign) mirror the classic
   * OpenAPI+ FID table as a reasonable starting point.
   */
  private mapExecutionPayload(values: Record<string, string>): Tick | null {
    const priceRaw = values['10'];
    const volumeRaw = values['15'];
    if (!priceRaw || !volumeRaw) return null;

    const price = Math.abs(Number.parseInt(priceRaw, 10));
    const volume = Math.abs(Number.parseInt(volumeRaw, 10));
    if (!Number.isFinite(price) || !Number.isFinite(volume)) return null;

    const changeSign = values['25']; // '1'/'2' = up, '4'/'5' = down (KRX convention)
    const side: TradeSide = changeSign === '4' || changeSign === '5' ? 'SELL' : 'BUY';

    return { price, volume, timestamp: Date.now(), side };
  }

  /**
   * Maps a raw "주식호가잔량" (0D) field map to a normalized OrderBook.
   * NOTE: real payloads expose 10 discrete bid/ask price+volume FIDs
   * (best ~ 10th level); wire them up here once confirmed against your
   * TR spec. Placeholder implementation returns null (no-op) so a
   * misconfigured mapping never corrupts the cache with zeroes.
   */
  private mapOrderBookPayload(_values: Record<string, string>): OrderBook | null {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMarketDataAdapter(): MarketDataAdapter {
  if (config.market.source === 'kiwoom') {
    const symbolNames: Record<string, string> = {};
    config.market.symbols.forEach((symbol, i) => {
      symbolNames[symbol] = config.market.symbolNames[i] ?? symbol;
    });
    return new KiwoomAdapter({
      symbols: config.market.symbols,
      symbolNames,
      restBaseUrl: config.kiwoom.restBaseUrl,
      wsUrl: config.kiwoom.wsUrl,
      appKey: config.kiwoom.appKey,
      appSecret: config.kiwoom.appSecret,
    });
  }

  return new MockMarketSimulator({
    symbol: config.market.symbols[0] ?? '005930',
    name: config.market.symbolNames[0] ?? 'Samsung Electronics',
    basePrice: config.mock.basePrice,
    tickIntervalMs: config.mock.tickIntervalMs,
    volatilityBps: config.mock.volatilityBps,
  });
}
