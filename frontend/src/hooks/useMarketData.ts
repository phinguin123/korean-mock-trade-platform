'use client';

import { useEffect, useRef } from 'react';
import { create } from 'zustand';
import type {
  ConnectionStatus,
  DopamineEvent,
  Leverage,
  MarketSnapshot,
  OrderBookLevel,
  OrderBookSnapshot,
  Portfolio,
  Position,
  Side,
  Tick,
} from '@/types/trading';

// ---------------------------------------------------------------------------
// Local mock market simulator. UI-only: nothing is routed anywhere.
// ---------------------------------------------------------------------------

const SYMBOL = '005930';
const NAME = 'Samsung Electronics';
const TICK_SIZE = 100;
const BASE_PRICE = 74_800;
const PREV_CLOSE = 73_900;
const DEPTH = 9;
const STARTING_BALANCE = 10_000_000;
const HISTORY = 90;

let tickSeq = 0;
let idSeq = 0;
const uid = (prefix: string) => `${prefix}-${++idSeq}`;

function randomVolume(distance: number): number {
  const base = 1_800 + Math.random() * 9_000;
  return Math.round(base * (1 + distance * 0.35));
}

function buildOrderBook(price: number): OrderBookSnapshot {
  const mid = Math.round(price / TICK_SIZE) * TICK_SIZE;
  const asks: OrderBookLevel[] = [];
  const bids: OrderBookLevel[] = [];
  for (let i = 0; i < DEPTH; i++) {
    asks.push({ price: mid + TICK_SIZE * (i + 1), volume: randomVolume(i) });
    bids.push({ price: mid - TICK_SIZE * i, volume: randomVolume(i) });
  }
  return { asks, bids };
}

function nextPrice(price: number): { price: number; side: Side } {
  const magnitude = Math.random() < 0.72 ? 1 : Math.random() < 0.85 ? 2 : 3;
  const up = Math.random() < 0.5;
  const delta = TICK_SIZE * magnitude * (up ? 1 : -1);
  const raw = price + delta;
  const clamped = Math.min(BASE_PRICE * 1.28, Math.max(BASE_PRICE * 0.72, raw));
  return { price: Math.round(clamped / TICK_SIZE) * TICK_SIZE, side: up ? 'BUY' : 'SELL' };
}

function makeTick(price: number, side: Side): Tick {
  return { id: ++tickSeq, timestamp: Date.now(), price, side };
}

function seedMarket(): MarketSnapshot {
  let price = BASE_PRICE;
  const ticks: Tick[] = [];
  for (let i = 0; i < HISTORY; i++) {
    const next = nextPrice(price);
    price = next.price;
    ticks.push(makeTick(price, next.side));
  }
  const prices = ticks.map((t) => t.price);
  return {
    symbol: SYMBOL,
    name: NAME,
    currentPrice: price,
    prevClose: PREV_CLOSE,
    changePercent: ((price - PREV_CLOSE) / PREV_CLOSE) * 100,
    high: Math.max(...prices),
    low: Math.min(...prices),
    totalVolume: 6_400_000 + Math.round(Math.random() * 800_000),
    orderBook: buildOrderBook(price),
    recentTicks: ticks,
  };
}

export function liquidationPrice(price: number, leverage: number, side: Side): number {
  const factor = 1 / leverage;
  return side === 'BUY' ? price * (1 - factor) : price * (1 + factor);
}

function unrealized(position: Position, price: number): number {
  return position.side === 'BUY'
    ? (price - position.entryPrice) * position.qty
    : (position.entryPrice - price) * position.qty;
}

function computeEquity(portfolio: Portfolio, price: number): number {
  return portfolio.positions
    .filter((p) => p.status === 'OPEN')
    .reduce((acc, p) => acc + p.margin + unrealized(p, price), portfolio.balance);
}

interface MarketState {
  symbol: string;
  market: MarketSnapshot | null;
  status: ConnectionStatus;
  latencyMs: number | null;
  tickDirection: 'up' | 'down' | null;

  leverage: Leverage;
  orderQty: number;
  selectedPrice: number | null;
  portfolio: Portfolio;
  effects: DopamineEvent[];
  lastRejectReason: string | null;

  connect: () => void;
  advance: () => void;
  setLeverage: (leverage: Leverage) => void;
  setOrderQty: (qty: number) => void;
  selectPrice: (price: number) => void;
  placeOrder: (side: Side) => void;
  closePosition: (id: string) => void;
  dismissEffect: (id: string) => void;
  clearRejectReason: () => void;
  reset: () => void;
}

export const useMarketData = create<MarketState>((set, get) => ({
  symbol: SYMBOL,
  market: null,
  status: 'connecting',
  latencyMs: null,
  tickDirection: null,

  leverage: 1,
  orderQty: 10,
  selectedPrice: null,
  portfolio: { balance: STARTING_BALANCE, equity: STARTING_BALANCE, positions: [] },
  effects: [],
  lastRejectReason: null,

  connect: () => {
    const market = seedMarket();
    set({
      market,
      status: 'open',
      latencyMs: 18 + Math.round(Math.random() * 24),
      portfolio: { ...get().portfolio, equity: computeEquity(get().portfolio, market.currentPrice) },
    });
  },

  advance: () => {
    const state = get();
    const market = state.market;
    if (!market) return;

    const next = nextPrice(market.currentPrice);
    const tick = makeTick(next.price, next.side);
    const recentTicks = [...market.recentTicks, tick].slice(-HISTORY);

    const nextMarket: MarketSnapshot = {
      ...market,
      currentPrice: next.price,
      changePercent: ((next.price - market.prevClose) / market.prevClose) * 100,
      high: Math.max(market.high, next.price),
      low: Math.min(market.low, next.price),
      totalVolume: market.totalVolume + Math.round(Math.random() * 4_800),
      orderBook: buildOrderBook(next.price),
      recentTicks,
    };

    // Liquidation sweep
    const effects: DopamineEvent[] = [];
    const balance = state.portfolio.balance;
    const positions = state.portfolio.positions.map((position) => {
      if (position.status !== 'OPEN') return position;
      const hit =
        position.side === 'BUY'
          ? next.price <= position.liquidationPrice
          : next.price >= position.liquidationPrice;
      if (!hit) return position;
      effects.push({
        id: uid('fx'),
        kind: 'loss',
        amount: -position.margin,
        label: 'Liquidated',
      });
      return { ...position, status: 'LIQUIDATED' as const };
    });

    const portfolio: Portfolio = { balance, equity: 0, positions };
    portfolio.equity = computeEquity(portfolio, next.price);

    set({
      market: nextMarket,
      tickDirection: next.price > market.currentPrice ? 'up' : next.price < market.currentPrice ? 'down' : state.tickDirection,
      latencyMs: 14 + Math.round(Math.random() * 30),
      portfolio,
      effects: effects.length ? [...state.effects, ...effects] : state.effects,
    });
  },

  setLeverage: (leverage) => set({ leverage }),
  setOrderQty: (qty) => set({ orderQty: Math.max(0, Math.round(qty * 100) / 100) }),
  selectPrice: (price) => set({ selectedPrice: price }),

  placeOrder: (side) => {
    const state = get();
    const price = state.market?.currentPrice ?? 0;
    const qty = state.orderQty;
    if (!price || qty <= 0) {
      set({ lastRejectReason: 'Enter a quantity greater than zero.' });
      return;
    }
    const margin = (qty * price) / state.leverage;
    if (margin > state.portfolio.balance) {
      set({ lastRejectReason: 'Not enough cash for this size and leverage.' });
      return;
    }

    const position: Position = {
      id: uid('pos'),
      symbol: state.symbol,
      side,
      qty,
      entryPrice: price,
      leverage: state.leverage,
      margin,
      liquidationPrice: liquidationPrice(price, state.leverage, side),
      status: 'OPEN',
      openedAt: Date.now(),
    };

    const portfolio: Portfolio = {
      balance: state.portfolio.balance - margin,
      equity: 0,
      positions: [position, ...state.portfolio.positions],
    };
    portfolio.equity = computeEquity(portfolio, price);

    set({
      portfolio,
      lastRejectReason: null,
      effects: [
        ...state.effects,
        {
          id: uid('fx'),
          kind: side === 'BUY' ? 'long' : 'short',
          amount: 0,
          label: `${state.leverage}x ${side === 'BUY' ? 'Long' : 'Short'} filled`,
        },
      ],
    });
  },

  closePosition: (id) => {
    const state = get();
    const price = state.market?.currentPrice ?? 0;
    const target = state.portfolio.positions.find((p) => p.id === id);
    if (!target || target.status !== 'OPEN') return;

    const pnl = unrealized(target, price);
    const positions = state.portfolio.positions.map((p) =>
      p.id === id ? { ...p, status: 'CLOSED' as const } : p,
    );
    const portfolio: Portfolio = {
      balance: state.portfolio.balance + target.margin + pnl,
      equity: 0,
      positions,
    };
    portfolio.equity = computeEquity(portfolio, price);

    set({
      portfolio,
      effects: [
        ...state.effects,
        {
          id: uid('fx'),
          kind: pnl >= 0 ? 'profit' : 'loss',
          amount: pnl,
          label: pnl >= 0 ? 'Profit realized' : 'Loss realized',
        },
      ],
    });
  },

  dismissEffect: (id) => set({ effects: get().effects.filter((e) => e.id !== id) }),
  clearRejectReason: () => set({ lastRejectReason: null }),
  reset: () =>
    set({
      portfolio: { balance: STARTING_BALANCE, equity: STARTING_BALANCE, positions: [] },
      effects: [],
      lastRejectReason: null,
    }),
}));

/** Boots the mock feed on mount and streams ticks while mounted. */
export function useMarketDataConnection(intervalMs = 900) {
  const started = useRef(false);

  useEffect(() => {
    const store = useMarketData.getState();
    if (!started.current) {
      started.current = true;
      if (!store.market) store.connect();
    }
    const id = window.setInterval(() => useMarketData.getState().advance(), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
}
