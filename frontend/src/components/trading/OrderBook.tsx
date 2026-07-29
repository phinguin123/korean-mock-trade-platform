'use client';

import { useMemo } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { formatCompact, formatNumber } from '@/lib/format';
import type { OrderBookLevel } from '@/types/trading';
import { Panel } from './Panel';

const ROWS = 9;
const EMPTY_LEVELS: OrderBookLevel[] = [];

function pad(levels: OrderBookLevel[], rows: number): (OrderBookLevel | null)[] {
  if (levels.length >= rows) return levels.slice(0, rows);
  return [...levels, ...Array<null>(rows - levels.length).fill(null)];
}

function DepthRow({
  level,
  maxVolume,
  side,
  prevClose,
  onSelect,
}: {
  level: OrderBookLevel | null;
  maxVolume: number;
  side: 'ask' | 'bid';
  prevClose: number;
  onSelect: (price: number) => void;
}) {
  const isAsk = side === 'ask';
  const pct = level && maxVolume > 0 ? Math.min(100, (level.volume / maxVolume) * 100) : 0;
  const priceTone = !level
    ? 'text-muted-foreground'
    : level.price >= prevClose
      ? 'text-up'
      : 'text-down';

  return (
    <button
      type="button"
      disabled={!level}
      onClick={() => level && onSelect(level.price)}
      className="group grid w-full grid-cols-[1fr_1fr] items-stretch gap-px text-left disabled:cursor-default"
    >
      {/* volume side (asks show volume on the left, bids on the right) */}
      <div
        className={`relative flex items-center px-2.5 py-1 ${isAsk ? '' : 'order-2 justify-end'}`}
      >
        <span
          className={`absolute inset-y-[2px] rounded-[3px] transition-[width] duration-300 ease-out ${
            isAsk ? 'right-0 bg-down/20' : 'left-0 bg-up/20'
          }`}
          style={{ width: `${pct}%` }}
          aria-hidden
        />
        <span className="relative z-10 text-[11px] font-medium tabular-nums text-muted-foreground">
          {level ? formatCompact(level.volume) : ''}
        </span>
      </div>

      <div
        className={`flex items-center justify-center bg-secondary/40 px-2 py-1 transition-colors group-hover:bg-secondary group-disabled:group-hover:bg-secondary/40 ${
          isAsk ? '' : 'order-1'
        }`}
      >
        <span className={`text-[12px] font-bold tabular-nums ${priceTone}`}>
          {level ? formatNumber(level.price) : '—'}
        </span>
      </div>
    </button>
  );
}

export function OrderBook() {
  const orderBook = useMarketData((s) => s.market?.orderBook);
  const currentPrice = useMarketData((s) => s.market?.currentPrice);
  const prevClose = useMarketData((s) => s.market?.prevClose) ?? 0;
  const changePercent = useMarketData((s) => s.market?.changePercent) ?? 0;
  const selectPrice = useMarketData((s) => s.selectPrice);

  const bids = orderBook?.bids ?? EMPTY_LEVELS;
  const asks = orderBook?.asks ?? EMPTY_LEVELS;

  const maxVolume = useMemo(() => {
    const volumes = [...bids, ...asks].map((l) => l.volume);
    return volumes.length ? Math.max(...volumes) : 0;
  }, [bids, asks]);

  const askRows = useMemo(() => [...pad(asks, ROWS)].reverse(), [asks]);
  const bidRows = useMemo(() => pad(bids, ROWS), [bids]);

  const askTotal = asks.reduce((a, l) => a + l.volume, 0);
  const bidTotal = bids.reduce((a, l) => a + l.volume, 0);
  const bidShare = askTotal + bidTotal > 0 ? (bidTotal / (askTotal + bidTotal)) * 100 : 50;
  const isUp = changePercent >= 0;

  return (
    <Panel title="Order book" bodyClassName="flex flex-col">
      <div className="grid grid-cols-2 gap-px border-b border-border/60 px-2.5 py-2 text-[11px] font-semibold text-muted-foreground">
        <span>Quantity</span>
        <span className="text-center">Price</span>
      </div>

      <div className="flex flex-1 flex-col justify-center gap-px py-1">
        {askRows.map((level, i) => (
          <DepthRow
            key={`ask-${i}`}
            level={level}
            maxVolume={maxVolume}
            side="ask"
            prevClose={prevClose}
            onSelect={selectPrice}
          />
        ))}

        <div className="my-1 flex items-center justify-between border-y border-border/70 bg-secondary/30 px-2.5 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Last
          </span>
          <span className={`text-[15px] font-bold tabular-nums ${isUp ? 'text-up' : 'text-down'}`}>
            {currentPrice !== undefined ? formatNumber(currentPrice) : '—'}
          </span>
          <span className={`text-[11px] font-semibold tabular-nums ${isUp ? 'text-up' : 'text-down'}`}>
            {isUp ? '+' : ''}
            {changePercent.toFixed(2)}%
          </span>
        </div>

        {bidRows.map((level, i) => (
          <DepthRow
            key={`bid-${i}`}
            level={level}
            maxVolume={maxVolume}
            side="bid"
            prevClose={prevClose}
            onSelect={selectPrice}
          />
        ))}
      </div>

      <div className="border-t border-border/60 px-2.5 py-2.5">
        <div className="flex items-center justify-between text-[11px] font-semibold tabular-nums">
          <span className="text-up">{bidShare.toFixed(1)}%</span>
          <span className="text-muted-foreground">Book balance</span>
          <span className="text-down">{(100 - bidShare).toFixed(1)}%</span>
        </div>
        <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-secondary" aria-hidden>
          <span
            className="bg-up transition-[width] duration-300"
            style={{ width: `${bidShare}%` }}
          />
          <span className="flex-1 bg-down" />
        </div>
      </div>
    </Panel>
  );
}
