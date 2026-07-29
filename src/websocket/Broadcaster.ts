import { randomUUID } from 'crypto';
import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import { config, primarySymbol } from '../config';
import { MatchingEngine, OrderRejectionError } from '../engine/MatchingEngine';
import { MarketDataStore } from '../store/MarketDataStore';
import {
  ClientMessage,
  ErrorMessage,
  OrderAckMessage,
  OrderRejectMessage,
  PlaceOrderMessage,
  PositionClosedMessage,
  PositionLiquidatedMessage,
  ServerMessage,
  SnapshotMessage,
  SymbolMarketState,
  Tick,
  TickUpdateMessage,
} from '../types/market';

// ---------------------------------------------------------------------------
// Zod schemas - validate every inbound client frame before it ever reaches
// business logic in MatchingEngine.
// ---------------------------------------------------------------------------

const LeverageSchema = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)]);

const PlaceOrderSchema = z.object({
  type: z.literal('PLACE_ORDER'),
  symbol: z.string().min(1, 'symbol is required'),
  side: z.enum(['BUY', 'SELL']),
  orderType: z.enum(['MARKET', 'LIMIT']),
  price: z.number().positive().optional(),
  qty: z.number().positive('qty must be > 0'),
  leverage: LeverageSchema,
});

const ClosePositionSchema = z.object({
  type: z.literal('CLOSE_POSITION'),
  positionId: z.string().min(1, 'positionId is required'),
});

const SubscribeSchema = z.object({
  type: z.literal('SUBSCRIBE'),
  symbol: z.string().min(1, 'symbol is required'),
});

const PingSchema = z.object({
  type: z.literal('PING'),
});

const ClientMessageSchema = z.discriminatedUnion('type', [
  PlaceOrderSchema,
  ClosePositionSchema,
  SubscribeSchema,
  PingSchema,
]);

// ---------------------------------------------------------------------------
// Connection bookkeeping
// ---------------------------------------------------------------------------

interface ClientState {
  userId: string;
  subscriptions: Set<string>;
  lastPongAt: number;
}

/**
 * High-throughput WebSocket broadcast layer.
 *
 * Responsibilities:
 *  - Accepts client connections, assigns each an ephemeral virtual userId.
 *  - Sends a full SNAPSHOT (market state + portfolio) on connect and on
 *    every SUBSCRIBE.
 *  - Fans out lightweight TICK_UPDATE deltas to all subscribers of a symbol
 *    the instant `MarketDataStore` mutates (event-driven, not polled).
 *  - Routes PLACE_ORDER / CLOSE_POSITION frames into `MatchingEngine` and
 *    replies with a typed ack/reject.
 *  - Runs ping/pong liveness checks, terminating unresponsive sockets.
 */
export class Broadcaster {
  private readonly wss: WebSocketServer;
  private readonly clients = new Map<WebSocket, ClientState>();
  private heartbeatHandle: NodeJS.Timeout | null = null;

  constructor(server: HttpServer) {
    this.wss = new WebSocketServer({ server });
    this.wss.on('connection', (socket) => this.onConnection(socket));

    MarketDataStore.on('tick', (symbol, state, tick) => this.broadcastTick(symbol, state, tick));
    MatchingEngine.on('liquidation', (userId, position, portfolio) =>
      this.sendToUser(userId, {
        type: 'POSITION_LIQUIDATED',
        position,
        portfolio,
      } satisfies PositionLiquidatedMessage),
    );

    this.startHeartbeat();
  }

  public get clientCount(): number {
    return this.clients.size;
  }

  public shutdown(): void {
    if (this.heartbeatHandle) clearInterval(this.heartbeatHandle);
    this.wss.clients.forEach((socket) => socket.terminate());
    this.wss.close();
  }

  // -------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------

  private onConnection(socket: WebSocket): void {
    const userId = randomUUID();
    const defaultSymbol = primarySymbol();

    const state: ClientState = {
      userId,
      subscriptions: new Set([defaultSymbol]),
      lastPongAt: Date.now(),
    };
    this.clients.set(socket, state);

    socket.on('pong', () => {
      const s = this.clients.get(socket);
      if (s) s.lastPongAt = Date.now();
    });

    socket.on('message', (raw) => this.onMessage(socket, state, raw));

    socket.on('close', () => {
      this.clients.delete(socket);
      MatchingEngine.removeUser(userId);
    });

    socket.on('error', () => {
      // Swallow - 'close' will follow and handle cleanup.
    });

    this.sendSnapshot(socket, state, defaultSymbol);
  }

  private onMessage(socket: WebSocket, state: ClientState, raw: unknown): void {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(String(raw));
    } catch {
      this.send(socket, this.errorMessage('Malformed JSON payload.'));
      return;
    }

    const result = ClientMessageSchema.safeParse(parsedJson);
    if (!result.success) {
      this.send(socket, this.errorMessage(this.formatZodError(result.error)));
      return;
    }

    this.routeMessage(socket, state, result.data);
  }

  private routeMessage(socket: WebSocket, state: ClientState, message: ClientMessage): void {
    switch (message.type) {
      case 'SUBSCRIBE':
        state.subscriptions.add(message.symbol);
        this.sendSnapshot(socket, state, message.symbol);
        return;

      case 'PING':
        this.send(socket, { type: 'PONG', serverTime: Date.now() });
        return;

      case 'PLACE_ORDER':
        this.handlePlaceOrder(socket, state, message);
        return;

      case 'CLOSE_POSITION':
        this.handleClosePosition(socket, state, message.positionId);
        return;

      default: {
        // Exhaustiveness guard - the discriminated union above should make
        // this unreachable, but keeps the switch safe against future
        // additions to ClientMessage.
        const _exhaustive: never = message;
        void _exhaustive;
      }
    }
  }

  // -------------------------------------------------------------------
  // Trading actions
  // -------------------------------------------------------------------

  private handlePlaceOrder(socket: WebSocket, state: ClientState, request: PlaceOrderMessage): void {
    try {
      const { order, portfolio } = MatchingEngine.placeOrder(state.userId, request);
      this.send(socket, { type: 'ORDER_ACK', order, portfolio } satisfies OrderAckMessage);
    } catch (err) {
      const reason = err instanceof OrderRejectionError ? err.message : 'Unexpected order processing error.';
      this.send(socket, { type: 'ORDER_REJECT', reason, request } satisfies OrderRejectMessage);
    }
  }

  private handleClosePosition(socket: WebSocket, state: ClientState, positionId: string): void {
    try {
      const { position, portfolio } = MatchingEngine.closePosition(state.userId, positionId);
      this.send(socket, { type: 'POSITION_CLOSED', position, portfolio } satisfies PositionClosedMessage);
    } catch (err) {
      const reason = err instanceof OrderRejectionError ? err.message : 'Unexpected error closing position.';
      this.send(socket, this.errorMessage(reason));
    }
  }

  // -------------------------------------------------------------------
  // Broadcasting
  // -------------------------------------------------------------------

  private sendSnapshot(socket: WebSocket, state: ClientState, symbol: string): void {
    const market = MarketDataStore.getState(symbol);
    if (!market) {
      this.send(socket, this.errorMessage(`Symbol "${symbol}" is not tracked by this server.`));
      return;
    }
    const portfolio = MatchingEngine.getOrCreatePortfolio(state.userId);
    const snapshot: SnapshotMessage = {
      type: 'SNAPSHOT',
      symbol,
      market,
      portfolio,
      serverTime: Date.now(),
    };
    this.send(socket, snapshot);
  }

  /** Fan-out a lightweight delta to every client subscribed to this symbol. */
  private broadcastTick(symbol: string, state: SymbolMarketState, tick: Tick): void {
    const message: TickUpdateMessage = {
      type: 'TICK_UPDATE',
      symbol,
      currentPrice: state.currentPrice,
      changePercent: state.changePercent,
      totalVolume: state.totalVolume,
      orderBook: state.orderBook,
      tick,
    };
    const payload = JSON.stringify(message);

    for (const [socket, clientState] of this.clients) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      if (!clientState.subscriptions.has(symbol)) continue;
      socket.send(payload);
    }
  }

  private sendToUser(userId: string, message: ServerMessage): void {
    for (const [socket, clientState] of this.clients) {
      if (clientState.userId === userId) {
        this.send(socket, message);
      }
    }
  }

  private send(socket: WebSocket, message: ServerMessage): void {
    if (socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  private errorMessage(message: string): ErrorMessage {
    return { type: 'ERROR', message };
  }

  private formatZodError(error: z.ZodError): string {
    return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
  }

  // -------------------------------------------------------------------
  // Heartbeat / stale connection reaping
  // -------------------------------------------------------------------

  private startHeartbeat(): void {
    this.heartbeatHandle = setInterval(() => {
      const now = Date.now();
      for (const [socket, state] of this.clients) {
        if (now - state.lastPongAt > config.ws.heartbeatTimeoutMs) {
          socket.terminate();
          this.clients.delete(socket);
          MatchingEngine.removeUser(state.userId);
          continue;
        }
        socket.ping();
      }
    }, config.ws.heartbeatIntervalMs);
  }
}
