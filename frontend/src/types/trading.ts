export type Side = 'BUY' | 'SELL';

export const ALLOWED_LEVERAGES = [1, 2, 3, 5] as const;
export type Leverage = (typeof ALLOWED_LEVERAGES)[number];

export type ConnectionStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface Tick {
  id: number;
  timestamp: number;
  price: number;
  side: Side;
}

export interface OrderBookLevel {
  price: number;
  volume: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface MarketSnapshot {
  symbol: string;
  name: string;
  currentPrice: number;
  prevClose: number;
  changePercent: number;
  high: number;
  low: number;
  totalVolume: number;
  orderBook: OrderBookSnapshot;
  recentTicks: Tick[];
}

export type PositionStatus = 'OPEN' | 'CLOSED' | 'LIQUIDATED';

export interface Position {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  entryPrice: number;
  leverage: Leverage;
  margin: number;
  liquidationPrice: number;
  status: PositionStatus;
  openedAt: number;
}

export interface Portfolio {
  balance: number;
  equity: number;
  positions: Position[];
}

export interface DopamineEvent {
  id: string;
  kind: 'profit' | 'loss' | 'long' | 'short';
  amount: number;
  label: string;
}
