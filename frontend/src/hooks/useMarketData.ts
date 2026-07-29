'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import type {
  ClientMessage,
  ConnectionStatus,
  DopamineEvent,
  Leverage,
  OrderType,
  Portfolio,
  ServerMessage,
  SymbolMarketState,
  TickDirection,
  TradeSide,
} from '@/types/trading';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'ws://localhost:8080';
const DEFAULT_SYMBOL = process.env.NEXT_PUBLIC_DEFAULT_SYMBOL ?? '005930';

const PING_INTERVAL_MS = 10_000;
const FLASH_RESET_MS = 150; // spec: flash resets after 150ms
const BASE_RECONNECT_DELAY_MS = 500;
const MAX_RECONNECT_DELAY_MS = 10_000;

// ---------------------------------------------------------------------------
// Module-level (non-reactive) connection handles.
//
// The socket, timers and reconnect counters intentionally live OUTSIDE the
// Zustand store so that scheduling a ping or a reconnect never itself
// triggers a re-render — only the pieces of state consumers actually read
// (price, book, portfolio, flash direction, ...) flow through `set()`.
// ---------------------------------------------------------------------------

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingTimer: ReturnType<typeof setInterval> | null = null;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let pingSentAt = 0;
let manuallyClosed = false;
let refCount = 0;

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

interface MarketDataState {
  status: ConnectionStatus;
  symbol: string;
  market: SymbolMarketState | null;
  portfolio: Portfolio | null;
  tickDirection: TickDirection;
  latencyMs: number | null;
  leverage: Leverage;
  orderQty: number;
  effects: DopamineEvent[];
  lastRejectReason: string | null;

  connect: () => void;
  disconnect: () => void;
  setLeverage: (leverage: Leverage) => void;
  setOrderQty: (qty: number) => void;
  placeOrder: (side: TradeSide, orderType?: OrderType, price?: number) => void;
  closePosition: (positionId: string) => void;
  dismissEffect: (id: string) => void;
  clearRejectReason: () => void;
}

function pushEffect(set: (fn: (s: MarketDataState) => Partial<MarketDataState>) => void, effect: Omit<DopamineEvent, 'id' | 'createdAt'>) {
  const event: DopamineEvent = {
    ...effect,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: Date.now(),
  };
  set((s) => ({ effects: [...s.effects, event] }));
}

export const useMarketData = create<MarketDataState>((set, get) => ({
  status: 'closed',
  symbol: DEFAULT_SYMBOL,
  market: null,
  portfolio: null,
  tickDirection: null,
  latencyMs: null,
  leverage: 1,
  orderQty: 1,
  effects: [],
  lastRejectReason: null,

  connect: () => {
    refCount += 1;
    if (typeof window === 'undefined') return;
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return;
    }
    manuallyClosed = false;
    openSocket(set, get);
  },

  disconnect: () => {
    refCount = Math.max(0, refCount - 1);
    // Keep the connection alive across component remounts (e.g. React
    // Strict Mode double-invoke) — only tear down once every consumer
    // has unmounted.
    if (refCount > 0) return;

    manuallyClosed = true;
    clearAllTimers();
    socket?.close();
    socket = null;
    set({ status: 'closed', latencyMs: null });
  },

  setLeverage: (leverage) => set({ leverage }),

  setOrderQty: (qty) => set({ orderQty: Number.isFinite(qty) && qty > 0 ? qty : 0 }),

  placeOrder: (side, orderType = 'MARKET', price) => {
    const { symbol, leverage, orderQty } = get();
    if (orderQty <= 0) return;
    send({
      type: 'PLACE_ORDER',
      symbol,
      side,
      orderType,
      qty: orderQty,
      leverage,
      ...(price !== undefined ? { price } : {}),
    });
  },

  closePosition: (positionId) => {
    send({ type: 'CLOSE_POSITION', positionId });
  },

  dismissEffect: (id) => set((s) => ({ effects: s.effects.filter((e) => e.id !== id) })),

  clearRejectReason: () => set({ lastRejectReason: null }),
}));

// ---------------------------------------------------------------------------
// Socket lifecycle
// ---------------------------------------------------------------------------

function openSocket(
  set: (partial: Partial<MarketDataState> | ((s: MarketDataState) => Partial<MarketDataState>)) => void,
  get: () => MarketDataState,
) {
  set({ status: reconnectAttempts > 0 ? 'reconnecting' : 'connecting' });

  const ws = new WebSocket(WS_URL);
  socket = ws;

  ws.onopen = () => {
    reconnectAttempts = 0;
    set({ status: 'open' });
    startHeartbeat(set);
  };

  ws.onmessage = (event) => {
    let message: ServerMessage;
    try {
      message = JSON.parse(event.data as string) as ServerMessage;
    } catch {
      return;
    }
    handleServerMessage(message, set, get);
  };

  ws.onerror = () => {
    // 'close' fires immediately after in browsers — no separate handling needed.
  };

  ws.onclose = () => {
    stopHeartbeat();
    if (socket === ws) socket = null;
    if (manuallyClosed) {
      set({ status: 'closed' });
      return;
    }
    set({ status: 'reconnecting', latencyMs: null });
    scheduleReconnect(set, get);
  };
}

function scheduleReconnect(
  set: (partial: Partial<MarketDataState> | ((s: MarketDataState) => Partial<MarketDataState>)) => void,
  get: () => MarketDataState,
) {
  if (reconnectTimer) return;
  const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (manuallyClosed) return;
    openSocket(set, get);
  }, delay);
}

function startHeartbeat(set: (partial: Partial<MarketDataState> | ((s: MarketDataState) => Partial<MarketDataState>)) => void) {
  stopHeartbeat();
  pingTimer = setInterval(() => {
    pingSentAt = performance.now();
    send({ type: 'PING' });
  }, PING_INTERVAL_MS);
  void set;
}

function stopHeartbeat() {
  if (pingTimer) {
    clearInterval(pingTimer);
    pingTimer = null;
  }
}

function clearAllTimers() {
  stopHeartbeat();
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (flashTimer) {
    clearTimeout(flashTimer);
    flashTimer = null;
  }
  reconnectAttempts = 0;
}

function send(message: ClientMessage) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

// ---------------------------------------------------------------------------
// Server -> client message handling (delta application, no full re-fetch)
// ---------------------------------------------------------------------------

function handleServerMessage(
  message: ServerMessage,
  set: (partial: Partial<MarketDataState> | ((s: MarketDataState) => Partial<MarketDataState>)) => void,
  get: () => MarketDataState,
) {
  switch (message.type) {
    case 'SNAPSHOT': {
      set({ symbol: message.symbol, market: message.market, portfolio: message.portfolio });
      return;
    }

    case 'TICK_UPDATE': {
      const prevPrice = get().market?.currentPrice;
      flashTick(set, prevPrice, message.currentPrice);
      set((s) => ({
        market: s.market
          ? {
              ...s.market,
              currentPrice: message.currentPrice,
              changePercent: message.changePercent,
              totalVolume: message.totalVolume,
              orderBook: message.orderBook,
              recentTicks: [...s.market.recentTicks, message.tick].slice(-50),
              updatedAt: Date.now(),
            }
          : s.market,
      }));
      return;
    }

    case 'ORDER_ACK': {
      const { order, portfolio } = message;
      set({ portfolio });
      pushEffect(set, {
        amount: order.side === 'BUY' ? order.qty * order.fillPrice : -(order.qty * order.fillPrice),
        kind: order.side === 'BUY' ? 'long' : 'short',
        label: order.side === 'BUY' ? 'LONG FILLED' : 'SHORT FILLED',
      });
      return;
    }

    case 'ORDER_REJECT': {
      set({ lastRejectReason: message.reason });
      return;
    }

    case 'POSITION_CLOSED':
    case 'POSITION_LIQUIDATED': {
      const { position, portfolio } = message;
      set({ portfolio });
      const pnl = position.realizedPnl ?? 0;
      pushEffect(set, {
        amount: pnl,
        kind: pnl >= 0 ? 'profit' : 'loss',
        label: message.type === 'POSITION_LIQUIDATED' ? 'LIQUIDATED' : 'CLOSED',
      });
      return;
    }

    case 'PORTFOLIO_UPDATE': {
      set({ portfolio: message.portfolio });
      return;
    }

    case 'PONG': {
      if (pingSentAt > 0) {
        set({ latencyMs: Math.max(0, Math.round(performance.now() - pingSentAt)) });
      }
      return;
    }

    case 'ERROR': {
      set({ lastRejectReason: message.message });
      return;
    }

    default:
      return;
  }
}

function flashTick(
  set: (partial: Partial<MarketDataState> | ((s: MarketDataState) => Partial<MarketDataState>)) => void,
  prevPrice: number | undefined,
  nextPrice: number,
) {
  if (prevPrice === undefined || nextPrice === prevPrice) return;
  const direction: TickDirection = nextPrice > prevPrice ? 'up' : 'down';
  set({ tickDirection: direction });
  if (flashTimer) clearTimeout(flashTimer);
  flashTimer = setTimeout(() => {
    useMarketData.setState({ tickDirection: null });
    flashTimer = null;
  }, FLASH_RESET_MS);
}

// ---------------------------------------------------------------------------
// React entry point — mount once near the root of the trading terminal.
// Safe to call from multiple components; the socket is reference-counted.
// ---------------------------------------------------------------------------

export function useMarketDataConnection(): void {
  const connect = useMarketData((s) => s.connect);
  const disconnect = useMarketData((s) => s.disconnect);

  useEffect(() => {
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
