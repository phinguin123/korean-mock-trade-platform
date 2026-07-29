/**
 * Core domain types shared across the ingestion, cache, matching engine and
 * websocket broadcast layers. Keeping these in one place guarantees that the
 * wire format (what clients receive) and the internal RAM model never drift
 * apart silently.
 */

// ---------------------------------------------------------------------------
// Market data primitives
// ---------------------------------------------------------------------------

export type TradeSide = 'BUY' | 'SELL';

export type OrderType = 'MARKET' | 'LIMIT';

export type Leverage = 1 | 2 | 3 | 5;

/** A single price level in the order book (top-of-book aggregated). */
export interface OrderBookLevel {
  price: number;
  volume: number;
}

/** Level-2 style order book snapshot: top N bids/asks, best price first. */
export interface OrderBook {
  bids: OrderBookLevel[]; // sorted descending by price (best bid first)
  asks: OrderBookLevel[]; // sorted ascending by price (best ask first)
}

/** A single executed tick trade printed on the tape. */
export interface Tick {
  price: number;
  volume: number;
  timestamp: number; // epoch millis
  side: TradeSide;
}

/** Full atomic market state for one symbol, as cached in RAM. */
export interface SymbolMarketState {
  symbol: string;
  name: string;
  currentPrice: number;
  prevClose: number;
  changePercent: number;
  totalVolume: number;
  orderBook: OrderBook;
  recentTicks: Tick[]; // most recent last-50 ticks, newest last
  updatedAt: number; // epoch millis of last mutation
}

// ---------------------------------------------------------------------------
// Virtual trading domain
// ---------------------------------------------------------------------------

export type PositionStatus = 'OPEN' | 'CLOSED' | 'LIQUIDATED';

/** An open (or historical) leveraged position held by a virtual user. */
export interface Position {
  id: string;
  userId: string;
  symbol: string;
  side: TradeSide; // BUY = long, SELL = short
  entryPrice: number;
  qty: number;
  leverage: Leverage;
  margin: number; // capital locked against this position
  liquidationPrice: number;
  status: PositionStatus;
  openedAt: number;
  closedAt?: number;
  closePrice?: number;
  realizedPnl?: number;
}

/** A processed (filled, rejected) order record kept for audit/history. */
export interface TradeOrder {
  id: string;
  userId: string;
  symbol: string;
  side: TradeSide;
  orderType: OrderType;
  requestedPrice?: number; // required for LIMIT orders
  fillPrice: number;
  qty: number;
  leverage: Leverage;
  margin: number;
  status: 'FILLED' | 'REJECTED';
  rejectReason?: string;
  createdAt: number;
}

/** A virtual user's full account snapshot. */
export interface Portfolio {
  userId: string;
  balance: number; // free cash, excludes locked margin
  equity: number; // balance + unrealized PnL of open positions
  marginUsed: number; // sum of margin currently locked in open positions
  positions: Position[];
}

// ---------------------------------------------------------------------------
// Client -> Server websocket messages
// ---------------------------------------------------------------------------

export interface PlaceOrderMessage {
  type: 'PLACE_ORDER';
  symbol: string;
  side: TradeSide;
  orderType: OrderType;
  price?: number;
  qty: number;
  leverage: Leverage;
}

export interface ClosePositionMessage {
  type: 'CLOSE_POSITION';
  positionId: string;
}

export interface SubscribeMessage {
  type: 'SUBSCRIBE';
  symbol: string;
}

export interface PingMessage {
  type: 'PING';
}

export type ClientMessage =
  | PlaceOrderMessage
  | ClosePositionMessage
  | SubscribeMessage
  | PingMessage;

// ---------------------------------------------------------------------------
// Server -> Client websocket messages
// ---------------------------------------------------------------------------

export interface SnapshotMessage {
  type: 'SNAPSHOT';
  symbol: string;
  market: SymbolMarketState;
  portfolio: Portfolio;
  serverTime: number;
}

/** Lightweight, high-frequency delta pushed on every tick. */
export interface TickUpdateMessage {
  type: 'TICK_UPDATE';
  symbol: string;
  currentPrice: number;
  changePercent: number;
  totalVolume: number;
  orderBook: OrderBook;
  tick: Tick;
}

export interface OrderAckMessage {
  type: 'ORDER_ACK';
  order: TradeOrder;
  portfolio: Portfolio;
}

export interface OrderRejectMessage {
  type: 'ORDER_REJECT';
  reason: string;
  request: PlaceOrderMessage;
}

export interface PositionClosedMessage {
  type: 'POSITION_CLOSED';
  position: Position;
  portfolio: Portfolio;
}

export interface PositionLiquidatedMessage {
  type: 'POSITION_LIQUIDATED';
  position: Position;
  portfolio: Portfolio;
}

export interface PortfolioUpdateMessage {
  type: 'PORTFOLIO_UPDATE';
  portfolio: Portfolio;
}

export interface ErrorMessage {
  type: 'ERROR';
  message: string;
}

export interface PongMessage {
  type: 'PONG';
  serverTime: number;
}

export type ServerMessage =
  | SnapshotMessage
  | TickUpdateMessage
  | OrderAckMessage
  | OrderRejectMessage
  | PositionClosedMessage
  | PositionLiquidatedMessage
  | PortfolioUpdateMessage
  | ErrorMessage
  | PongMessage;

/** Union of every message that can travel across the websocket wire. */
export type WSMessage = ClientMessage | ServerMessage;
