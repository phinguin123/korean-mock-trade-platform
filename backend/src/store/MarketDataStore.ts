import { EventEmitter } from 'events';
import {
  OrderBook,
  OrderBookLevel,
  SymbolMarketState,
  Tick,
} from '../types/market';

const MAX_RECENT_TICKS = 50;
const MAX_BOOK_DEPTH = 10;

export interface MarketStoreEvents {
  tick: (symbol: string, state: SymbolMarketState, tick: Tick) => void;
  orderbook: (symbol: string, state: SymbolMarketState) => void;
}

/**
 * Singleton, atomic, in-memory RAM cache for market state.
 *
 * This is intentionally a plain-object cache (no DB round-trip) so that the
 * hot path (tick ingestion -> broadcast) stays in the microsecond range.
 * Every mutation replaces the `orderBook`/`recentTicks` arrays wholesale
 * (rather than mutating in place) so that any reference handed out to a
 * consumer (e.g. for a SNAPSHOT message) is an immutable point-in-time copy.
 */
class MarketDataStoreImpl extends EventEmitter {
  private readonly states = new Map<string, SymbolMarketState>();

  /** Registers a symbol so it can start receiving ticks/order book updates. */
  public initSymbol(symbol: string, name: string, startPrice: number): SymbolMarketState {
    const existing = this.states.get(symbol);
    if (existing) return existing;

    const state: SymbolMarketState = {
      symbol,
      name,
      currentPrice: startPrice,
      prevClose: startPrice,
      changePercent: 0,
      totalVolume: 0,
      orderBook: { bids: [], asks: [] },
      recentTicks: [],
      updatedAt: Date.now(),
    };
    this.states.set(symbol, state);
    return state;
  }

  public hasSymbol(symbol: string): boolean {
    return this.states.has(symbol);
  }

  public getState(symbol: string): SymbolMarketState | undefined {
    return this.states.get(symbol);
  }

  public getAllStates(): SymbolMarketState[] {
    return Array.from(this.states.values());
  }

  public getCurrentPrice(symbol: string): number | undefined {
    return this.states.get(symbol)?.currentPrice;
  }

  /**
   * Applies a new executed tick trade to the cache: updates last price,
   * change percent, cumulative volume, and appends to the bounded tape.
   */
  public applyTick(symbol: string, tick: Tick): SymbolMarketState {
    const state = this.requireState(symbol);

    const recentTicks = [...state.recentTicks, tick];
    if (recentTicks.length > MAX_RECENT_TICKS) {
      recentTicks.splice(0, recentTicks.length - MAX_RECENT_TICKS);
    }

    const changePercent =
      state.prevClose > 0 ? ((tick.price - state.prevClose) / state.prevClose) * 100 : 0;

    const next: SymbolMarketState = {
      ...state,
      currentPrice: tick.price,
      changePercent: Number(changePercent.toFixed(2)),
      totalVolume: state.totalVolume + tick.volume,
      recentTicks,
      updatedAt: Date.now(),
    };

    this.states.set(symbol, next);
    this.emit('tick', symbol, next, tick);
    return next;
  }

  /**
   * Replaces the top-of-book snapshot (top 10 bids/asks). Bids are sorted
   * descending (best bid first), asks ascending (best ask first), and both
   * are truncated to the configured depth so payload size stays bounded.
   */
  public updateOrderBook(symbol: string, book: OrderBook): SymbolMarketState {
    const state = this.requireState(symbol);

    const bids = this.normalizeLevels(book.bids, 'desc');
    const asks = this.normalizeLevels(book.asks, 'asc');

    const next: SymbolMarketState = {
      ...state,
      orderBook: { bids, asks },
      updatedAt: Date.now(),
    };

    this.states.set(symbol, next);
    this.emit('orderbook', symbol, next);
    return next;
  }

  /** Marks the current price as the new reference (previous close) - e.g. at session rollover. */
  public rebaseSession(symbol: string): void {
    const state = this.requireState(symbol);
    this.states.set(symbol, {
      ...state,
      prevClose: state.currentPrice,
      changePercent: 0,
      totalVolume: 0,
      updatedAt: Date.now(),
    });
  }

  private normalizeLevels(levels: OrderBookLevel[], direction: 'asc' | 'desc'): OrderBookLevel[] {
    const sorted = [...levels].sort((a, b) =>
      direction === 'asc' ? a.price - b.price : b.price - a.price,
    );
    return sorted.slice(0, MAX_BOOK_DEPTH);
  }

  private requireState(symbol: string): SymbolMarketState {
    const state = this.states.get(symbol);
    if (!state) {
      throw new Error(
        `MarketDataStore: symbol "${symbol}" was not initialized. Call initSymbol() first.`,
      );
    }
    return state;
  }
}

/** Process-wide singleton instance - the single source of truth for market state. */
export const MarketDataStore = new MarketDataStoreImpl();
