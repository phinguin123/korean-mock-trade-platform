'use client';

import { useState } from 'react';
import { useMarketDataConnection } from '@/hooks/useMarketData';
import { ChartPanel } from './ChartPanel';
import { DopamineEffects } from './DopamineEffects';
import { IndexTicker } from './IndexTicker';
import { InvestSidebar } from './InvestSidebar';
import { OrderBook } from './OrderBook';
import { OrderPanel } from './OrderPanel';
import { PositionList } from './PositionList';
import { TickerBar } from './TickerBar';
import { TradeTape } from './TradeTape';

export function TradingTerminal() {
  useMarketDataConnection();
  const [panelsVisible, setPanelsVisible] = useState(true);

  return (
    <div className="flex min-h-screen flex-col bg-background xl:h-screen xl:overflow-hidden">
      <TickerBar panelsVisible={panelsVisible} onTogglePanels={() => setPanelsVisible((v) => !v)} />

      <div className="min-h-0 flex-1 overflow-y-auto p-3 xl:overflow-hidden">
        <div
          className={`grid grid-cols-1 gap-3 xl:h-full ${
            panelsVisible
              ? 'xl:grid-cols-[minmax(0,1fr)_290px_330px_260px]'
              : 'xl:grid-cols-[minmax(0,1fr)_290px_330px]'
          }`}
        >
          <div className="flex min-h-0 flex-col gap-3">
            <div className="h-[420px] shrink-0 xl:h-[58%] xl:min-h-[280px]">
              <ChartPanel />
            </div>
            <div className="h-[360px] shrink-0 xl:h-auto xl:min-h-0 xl:flex-1">
              <TradeTape />
            </div>
          </div>

          <div className="h-[520px] shrink-0 xl:h-auto xl:min-h-0">
            <OrderBook />
          </div>

          <div className="flex min-h-0 flex-col gap-3">
            <div className="shrink-0">
              <OrderPanel />
            </div>
            <div className="h-[260px] shrink-0 xl:h-auto xl:min-h-0 xl:flex-1">
              <PositionList />
            </div>
          </div>

          {panelsVisible && (
            <div className="h-[420px] shrink-0 xl:h-auto xl:min-h-0">
              <InvestSidebar />
            </div>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] font-medium text-muted-foreground xl:hidden">
          Simulated market · virtual capital only · no real orders are routed
        </p>
      </div>

      <IndexTicker />
      <DopamineEffects />
    </div>
  );
}
