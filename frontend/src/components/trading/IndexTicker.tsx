'use client';

import { useEffect, useState } from 'react';

interface IndexQuote {
  label: string;
  base: number;
  decimals: number;
}

const INDICES: IndexQuote[] = [
  { label: 'KOSPI', base: 2648.32, decimals: 2 },
  { label: 'Dollar Index', base: 101.43, decimals: 2 },
  { label: 'USD/KRW', base: 1455.45, decimals: 2 },
  { label: 'Nasdaq Composite', base: 24855.64, decimals: 2 },
  { label: 'Nasdaq 100 Futures', base: 27907, decimals: 0 },
  { label: 'S&P 500', base: 7423, decimals: 0 },
  { label: 'S&P 500 Futures', base: 7455.5, decimals: 1 },
];

function seededJitter(seed: number, tick: number): number {
  const x = Math.sin(seed * 999 + tick) * 10000;
  return (x - Math.floor(x) - 0.5) * 0.4;
}

/** Slim, always-visible strip of macro indices — pure ambience, no real feed. */
export function IndexTicker() {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 3000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex h-9 shrink-0 items-center gap-6 overflow-x-auto border-t border-border bg-background px-4 text-[12px]">
      {INDICES.map((idx, i) => {
        const changePct = seededJitter(i + 1, tick);
        const value = idx.base * (1 + changePct / 100);
        const isUp = changePct >= 0;
        return (
          <div key={idx.label} className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
            <span className="font-medium text-muted-foreground">{idx.label}</span>
            <span className="font-bold tabular-nums text-foreground">
              {value.toLocaleString('en-US', {
                minimumFractionDigits: idx.decimals,
                maximumFractionDigits: idx.decimals,
              })}
            </span>
            <span className={`font-semibold tabular-nums ${isUp ? 'text-up' : 'text-down'}`}>
              {isUp ? '+' : ''}
              {changePct.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
