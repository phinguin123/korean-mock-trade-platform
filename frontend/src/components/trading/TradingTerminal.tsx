'use client';

import { useMarketDataConnection } from '@/hooks/useMarketData';
import { DopamineEffects } from './DopamineEffects';
import { LeverageSelector } from './LeverageSelector';
import { OrderBook } from './OrderBook';
import { OrderPanel } from './OrderPanel';
import { PriceHeader } from './PriceHeader';

export function TradingTerminal() {
  useMarketDataConnection();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-3 p-3 lg:p-4">
        <PriceHeader />

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-4 xl:col-span-3">
            <OrderBook />
          </div>

          <div className="flex flex-col gap-3 lg:col-span-8 xl:col-span-9">
            <LeverageSelector />
            <div className="relative">
              <OrderPanel />
              <DopamineEffects />
            </div>
          </div>
        </div>

        <footer className="pb-2 pt-1 text-center text-[10px] text-slate-700">
          Mock trading terminal · virtual capital only · no real orders are ever routed
        </footer>
      </div>
    </div>
  );
}
