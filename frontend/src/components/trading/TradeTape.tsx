'use client';

import { useState } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { formatCompact, formatNumber } from '@/lib/format';
import type { Tick } from '@/types/trading';
import { Panel } from './Panel';

const EMPTY_TICKS: Tick[] = [];
const MODES = ['Live', 'Daily'] as const;

function timeLabel(ts: number) {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function TradeTape() {
  const recentTicks = useMarketData((s) => s.market?.recentTicks) ?? EMPTY_TICKS;
  const prevClose = useMarketData((s) => s.market?.prevClose) ?? 0;
  const [mode, setMode] = useState<string>('Live');

  const rows = [...recentTicks].reverse().slice(0, 26);

  return (
    <Panel title="Trades" bodyClassName="flex min-h-0 flex-col">
      <div className="flex items-center gap-0.5 border-b border-border/60 px-2.5 py-2">
        <div className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1 text-[12px] font-bold transition-colors ${
                mode === m
                  ? 'bg-card text-foreground shadow-toss'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-border/60 px-3 py-1.5 text-[11px] font-semibold text-muted-foreground">
        <span>Price</span>
        <span className="text-right">Qty</span>
        <span className="w-[58px] text-right">Time</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.map((tick) => {
          const up = tick.price >= prevClose;
          return (
            <div
              key={tick.id}
              className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-[5px] text-[12px] tabular-nums transition-colors hover:bg-secondary/50"
            >
              <span className={`font-bold ${up ? 'text-up' : 'text-down'}`}>
                {formatNumber(tick.price)}
              </span>
              <span className="text-right font-medium text-secondary-foreground">
                {formatCompact(180 + (tick.id % 23) * 46)}
              </span>
              <span className="w-[58px] text-right font-medium text-muted-foreground">
                {timeLabel(tick.timestamp)}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
