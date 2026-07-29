'use client';

import { useMemo } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import type { OrderBookLevel } from '@/types/trading';

const DEPTH_ROWS = 10;
const EMPTY_LEVELS: OrderBookLevel[] = [];

function formatPrice(price: number): string {
  return Math.round(price).toLocaleString('ko-KR');
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return volume.toLocaleString('ko-KR');
}

function padLevels(levels: OrderBookLevel[], rows: number): (OrderBookLevel | null)[] {
  if (levels.length >= rows) return levels.slice(0, rows);
  return [...levels, ...Array<null>(rows - levels.length).fill(null)];
}

interface DepthRowProps {
  level: OrderBookLevel | null;
  maxVolume: number;
  side: 'ask' | 'bid';
}

function DepthRow({ level, maxVolume, side }: DepthRowProps) {
  const isAsk = side === 'ask';
  const depthPct = level && maxVolume > 0 ? Math.min(100, (level.volume / maxVolume) * 100) : 0;

  return (
    <div className="relative grid grid-cols-2 items-center gap-2 px-3 py-[3px] font-mono text-[13px] leading-tight">
      <div
        className={`absolute inset-y-0 ${isAsk ? 'right-0 bg-rose-500/15' : 'right-0 bg-emerald-500/15'}`}
        style={{ width: `${depthPct}%` }}
        aria-hidden
      />
      <span className={`relative z-10 tabular-nums ${isAsk ? 'text-rose-400' : 'text-emerald-400'}`}>
        {level ? formatPrice(level.price) : '—'}
      </span>
      <span className="relative z-10 text-right tabular-nums text-slate-400">
        {level ? formatVolume(level.volume) : '—'}
      </span>
    </div>
  );
}

export function OrderBook() {
  const orderBook = useMarketData((s) => s.market?.orderBook);
  const currentPrice = useMarketData((s) => s.market?.currentPrice);
  const changePercent = useMarketData((s) => s.market?.changePercent) ?? 0;
  const tickDirection = useMarketData((s) => s.tickDirection);

  const bids = orderBook?.bids ?? EMPTY_LEVELS;
  const asks = orderBook?.asks ?? EMPTY_LEVELS;

  const maxVolume = useMemo(() => {
    const all = [...bids, ...asks].map((l) => l.volume);
    return all.length ? Math.max(...all) : 0;
  }, [bids, asks]);

  const spread = useMemo(() => {
    if (!asks.length || !bids.length) return null;
    return asks[0].price - bids[0].price;
  }, [asks, bids]);

  // Best ask (lowest) rendered closest to the spread — reverse the
  // ascending, best-first array the backend sends.
  const askRows = useMemo(() => [...padLevels(asks, DEPTH_ROWS)].reverse(), [asks]);
  const bidRows = useMemo(() => padLevels(bids, DEPTH_ROWS), [bids]);

  const priceColor =
    tickDirection === 'up' ? 'text-emerald-400' : tickDirection === 'down' ? 'text-rose-400' : 'text-slate-100';

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-slate-800 bg-slate-900/60">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Order Book · L2</h2>
        <span className="text-[10px] text-slate-500">Depth {DEPTH_ROWS}</span>
      </div>

      <div className="grid grid-cols-2 gap-2 px-3 pt-2 text-[10px] uppercase tracking-wider text-slate-500">
        <span>Price (₩)</span>
        <span className="text-right">Qty</span>
      </div>

      {/* Asks */}
      <div className="flex flex-1 flex-col justify-end py-1">
        {askRows.map((level, i) => (
          <DepthRow key={`ask-${i}`} level={level} maxVolume={maxVolume} side="ask" />
        ))}
      </div>

      {/* Spread / current price */}
      <div className="flex flex-col items-center gap-0.5 border-y border-slate-800 bg-slate-950/80 py-3">
        <span className={`text-2xl font-bold tabular-nums transition-colors duration-150 ${priceColor}`}>
          {currentPrice !== undefined ? formatPrice(currentPrice) : '—'}
        </span>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
            {changePercent >= 0 ? '+' : ''}
            {changePercent.toFixed(2)}%
          </span>
          {spread !== null && <span className="text-slate-500">Spread {formatPrice(spread)}</span>}
        </div>
      </div>

      {/* Bids */}
      <div className="flex flex-1 flex-col py-1">
        {bidRows.map((level, i) => (
          <DepthRow key={`bid-${i}`} level={level} maxVolume={maxVolume} side="bid" />
        ))}
      </div>
    </div>
  );
}
