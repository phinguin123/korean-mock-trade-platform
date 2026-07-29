'use client';

import { Camera, Maximize2, Settings2 } from 'lucide-react';
import { useState } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import type { Tick } from '@/types/trading';
import { CandleChart } from './CandleChart';
import { Panel, PanelIconButton } from './Panel';

const TIMEFRAMES = ['5m', '1D', '1W', '1M', '1Y'] as const;
const EMPTY_TICKS: Tick[] = [];

export function ChartPanel() {
  const recentTicks = useMarketData((s) => s.market?.recentTicks) ?? EMPTY_TICKS;
  const prevClose = useMarketData((s) => s.market?.prevClose) ?? 0;
  const [active, setActive] = useState<string>('5m');

  return (
    <Panel
      title="Chart"
      actions={
        <>
          <PanelIconButton label="Chart settings">
            <Settings2 size={14} />
          </PanelIconButton>
          <PanelIconButton label="Snapshot">
            <Camera size={14} />
          </PanelIconButton>
          <PanelIconButton label="Expand chart">
            <Maximize2 size={14} />
          </PanelIconButton>
        </>
      }
      bodyClassName="flex flex-col"
    >
      <div className="flex items-center gap-1 border-b border-border/60 px-3 py-2">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf}
            type="button"
            onClick={() => setActive(tf)}
            aria-pressed={active === tf}
            className={`rounded-lg px-2.5 py-1 text-[12px] font-bold transition-colors ${
              active === tf
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tf}
          </button>
        ))}
      </div>

      <div className="min-h-[240px] flex-1 px-3 py-3">
        <CandleChart ticks={recentTicks} prevClose={prevClose} />
      </div>
    </Panel>
  );
}
