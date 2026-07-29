import { randomUUID } from 'crypto';
import { EventEmitter } from 'events';
import { config } from '../config';
import { MarketDataStore } from '../store/MarketDataStore';
import {
  Leverage,
  PlaceOrderMessage,
  Portfolio,
  Position,
  TradeOrder,
  TradeSide,
} from '../types/market';

/** Thrown for any business-rule failure (insufficient margin, bad symbol, ...). */
export class OrderRejectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderRejectionError';
  }
}

export interface MatchingEngineEvents {
  liquidation: (userId: string, position: Position, portfolio: Portfolio) => void;
}

interface InternalPortfolio {
  userId: string;
  balance: number;
  positions: Map<string, Position>;
}

/**
 * In-memory virtual matching & ledger engine.
 *
 * Design notes:
 *  - Every user starts with `config.trading.initialVirtualBalance` in cash.
 *  - Orders fill instantly (slippage-free) against the current cached
 *    market price - this is Step 1's "instant execution" model; a resting
 *    order book for client LIMIT orders can be layered on top later.
 *  - Positions use isolated margin: opening a position locks
 *    `(price * qty) / leverage` out of `balance` into that position's
 *    `margin`. Losses beyond the locked margin are clamped so a single
 *    position can never push a virtual account negative.
 *  - The engine listens to `MarketDataStore` tick events and auto-liquidates
 *    any open position whose liquidation boundary has been touched.
 */
class MatchingEngineImpl extends EventEmitter {
  private readonly portfolios = new Map<string, InternalPortfolio>();

  constructor() {
    super();
    MarketDataStore.on('tick', (symbol: string, _state, tick) => {
      this.checkLiquidations(symbol, tick.price);
    });
  }

  // -------------------------------------------------------------------
  // Portfolio access
  // -------------------------------------------------------------------

  public getOrCreatePortfolio(userId: string): Portfolio {
    return this.toPublicPortfolio(this.getOrCreateInternal(userId));
  }

  private getOrCreateInternal(userId: string): InternalPortfolio {
    let p = this.portfolios.get(userId);
    if (!p) {
      p = { userId, balance: config.trading.initialVirtualBalance, positions: new Map() };
      this.portfolios.set(userId, p);
    }
    return p;
  }

  public removeUser(userId: string): void {
    this.portfolios.delete(userId);
  }

  // -------------------------------------------------------------------
  // Order placement
  // -------------------------------------------------------------------

  public placeOrder(userId: string, req: PlaceOrderMessage): { order: TradeOrder; portfolio: Portfolio } {
    const portfolio = this.getOrCreateInternal(userId);
    const marketState = MarketDataStore.getState(req.symbol);

    if (!marketState || marketState.currentPrice <= 0) {
      throw new OrderRejectionError(`Symbol "${req.symbol}" has no active market data.`);
    }
    if (!config.trading.allowedLeverages.includes(req.leverage)) {
      throw new OrderRejectionError(
        `Leverage ${req.leverage}x is not permitted. Allowed: ${config.trading.allowedLeverages.join(', ')}x.`,
      );
    }
    if (req.qty <= 0 || !Number.isFinite(req.qty)) {
      throw new OrderRejectionError('Quantity must be a positive number.');
    }
    if (req.orderType === 'LIMIT' && (req.price === undefined || req.price <= 0)) {
      throw new OrderRejectionError('LIMIT orders require a positive price.');
    }

    const fillPrice = this.resolveFillPrice(req, marketState.currentPrice);
    const notional = fillPrice * req.qty;
    const requiredMargin = notional / req.leverage;

    if (portfolio.balance < requiredMargin) {
      throw new OrderRejectionError(
        `Insufficient balance: required margin ${requiredMargin.toFixed(2)} exceeds available balance ${portfolio.balance.toFixed(2)}.`,
      );
    }

    const liquidationPrice = this.computeLiquidationPrice(req.side, fillPrice, req.leverage);

    const position: Position = {
      id: randomUUID(),
      userId,
      symbol: req.symbol,
      side: req.side,
      entryPrice: fillPrice,
      qty: req.qty,
      leverage: req.leverage,
      margin: requiredMargin,
      liquidationPrice,
      status: 'OPEN',
      openedAt: Date.now(),
    };

    portfolio.balance -= requiredMargin;
    portfolio.positions.set(position.id, position);

    const order: TradeOrder = {
      id: randomUUID(),
      userId,
      symbol: req.symbol,
      side: req.side,
      orderType: req.orderType,
      requestedPrice: req.price,
      fillPrice,
      qty: req.qty,
      leverage: req.leverage,
      margin: requiredMargin,
      status: 'FILLED',
      createdAt: Date.now(),
    };

    return { order, portfolio: this.toPublicPortfolio(portfolio) };
  }

  /**
   * Market orders fill instantly at the last traded price (slippage-free).
   * Limit orders only fill immediately if already marketable (crossing the
   * current price); otherwise they're rejected since Step 1 has no resting
   * order book for client orders yet.
   */
  private resolveFillPrice(req: PlaceOrderMessage, currentPrice: number): number {
    if (req.orderType === 'MARKET') {
      return currentPrice;
    }

    const limitPrice = req.price as number;
    const marketable =
      req.side === 'BUY' ? currentPrice <= limitPrice : currentPrice >= limitPrice;

    if (!marketable) {
      throw new OrderRejectionError(
        `LIMIT price ${limitPrice} is not marketable against current price ${currentPrice}. ` +
          'Resting limit orders are not yet supported (Step 1 executes immediately-marketable orders only).',
      );
    }
    return limitPrice;
  }

  private computeLiquidationPrice(side: TradeSide, entryPrice: number, leverage: Leverage): number {
    const factor = 1 / leverage;
    return side === 'BUY' ? entryPrice * (1 - factor) : entryPrice * (1 + factor);
  }

  // -------------------------------------------------------------------
  // Closing positions
  // -------------------------------------------------------------------

  public closePosition(userId: string, positionId: string): { position: Position; portfolio: Portfolio } {
    const portfolio = this.getOrCreateInternal(userId);
    const position = portfolio.positions.get(positionId);

    if (!position) {
      throw new OrderRejectionError(`Position "${positionId}" not found.`);
    }
    if (position.status !== 'OPEN') {
      throw new OrderRejectionError(`Position "${positionId}" is already ${position.status.toLowerCase()}.`);
    }

    const marketState = MarketDataStore.getState(position.symbol);
    if (!marketState) {
      throw new OrderRejectionError(`Symbol "${position.symbol}" has no active market data.`);
    }

    const closed = this.settlePosition(portfolio, position, marketState.currentPrice, 'CLOSED');
    return { position: closed, portfolio: this.toPublicPortfolio(portfolio) };
  }

  private settlePosition(
    portfolio: InternalPortfolio,
    position: Position,
    closePrice: number,
    finalStatus: 'CLOSED' | 'LIQUIDATED',
  ): Position {
    const rawPnl =
      position.side === 'BUY'
        ? (closePrice - position.entryPrice) * position.qty
        : (position.entryPrice - closePrice) * position.qty;

    // Isolated margin: a single position can never lose more than the
    // margin that was locked against it.
    const realizedPnl = Math.max(rawPnl, -position.margin);

    const updated: Position = {
      ...position,
      status: finalStatus,
      closedAt: Date.now(),
      closePrice,
      realizedPnl,
    };

    portfolio.balance += position.margin + realizedPnl;
    portfolio.positions.set(position.id, updated);

    return updated;
  }

  // -------------------------------------------------------------------
  // Liquidation engine
  // -------------------------------------------------------------------

  private checkLiquidations(symbol: string, price: number): void {
    for (const portfolio of this.portfolios.values()) {
      for (const position of portfolio.positions.values()) {
        if (position.status !== 'OPEN' || position.symbol !== symbol) continue;

        const touched =
          position.side === 'BUY' ? price <= position.liquidationPrice : price >= position.liquidationPrice;

        if (touched) {
          const liquidated = this.settlePosition(portfolio, position, position.liquidationPrice, 'LIQUIDATED');
          this.emit('liquidation', portfolio.userId, liquidated, this.toPublicPortfolio(portfolio));
        }
      }
    }
  }

  // -------------------------------------------------------------------
  // Derived views
  // -------------------------------------------------------------------

  private toPublicPortfolio(p: InternalPortfolio): Portfolio {
    const positions = Array.from(p.positions.values());
    let unrealizedPnl = 0;
    let marginUsed = 0;

    for (const position of positions) {
      if (position.status !== 'OPEN') continue;
      marginUsed += position.margin;
      const currentPrice = MarketDataStore.getCurrentPrice(position.symbol) ?? position.entryPrice;
      unrealizedPnl +=
        position.side === 'BUY'
          ? (currentPrice - position.entryPrice) * position.qty
          : (position.entryPrice - currentPrice) * position.qty;
    }

    return {
      userId: p.userId,
      balance: round2(p.balance),
      equity: round2(p.balance + marginUsed + unrealizedPnl),
      marginUsed: round2(marginUsed),
      positions: positions
        .slice()
        .sort((a, b) => b.openedAt - a.openedAt)
        .map((pos) => ({ ...pos })),
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Process-wide singleton - one ledger for the whole server instance. */
export const MatchingEngine = new MatchingEngineImpl();
