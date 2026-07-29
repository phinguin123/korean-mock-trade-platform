'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useMarketData } from '@/hooks/useMarketData';
import { ALLOWED_LEVERAGES, type Leverage } from '@/types/trading';

function formatKrw(value: number): string {
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

const LEVERAGE_META: Record<Leverage, { label: string; sub: string }> = {
  1: { label: '1x', sub: 'Safe' },
  2: { label: '2x', sub: 'Steady' },
  3: { label: '3x', sub: 'Aggro' },
  5: { label: '5x', sub: 'YOLO' },
};

export function LeverageSelector() {
  const leverage = useMarketData((s) => s.leverage);
  const setLeverage = useMarketData((s) => s.setLeverage);
  const orderQty = useMarketData((s) => s.orderQty);
  const currentPrice = useMarketData((s) => s.market?.currentPrice) ?? 0;
  const balance = useMarketData((s) => s.portfolio?.balance) ?? 0;

  const notional = orderQty * currentPrice;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Leverage</h2>
        {leverage === 5 && (
          <span className="flex items-center gap-1 rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-bold text-orange-400">
            <Flame size={11} /> MEME MODE
          </span>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {ALLOWED_LEVERAGES.map((lev) => {
          const meta = LEVERAGE_META[lev];
          const active = leverage === lev;
          const isYolo = lev === 5;

          return (
            <button
              key={lev}
              type="button"
              onClick={() => setLeverage(lev)}
              className={`relative overflow-hidden rounded-md border px-2 py-2.5 text-center transition-all duration-150 active:scale-95 ${
                active
                  ? isYolo
                    ? 'border-orange-500 bg-orange-500/15 shadow-[0_0_0_1px_rgba(249,115,22,0.4)]'
                    : 'border-emerald-500 bg-emerald-500/15 shadow-[0_0_0_1px_rgba(16,185,129,0.35)]'
                  : 'border-slate-800 bg-slate-950 hover:border-slate-700 hover:bg-slate-900'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="leverage-active-glow"
                  className={`absolute inset-0 -z-10 ${isYolo ? 'bg-orange-500/10' : 'bg-emerald-500/10'}`}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <div
                className={`font-mono text-lg font-bold ${
                  active ? (isYolo ? 'text-orange-400' : 'text-emerald-400') : 'text-slate-200'
                }`}
              >
                {meta.label}
              </div>
              <div
                className={`text-[10px] font-medium uppercase tracking-wide ${
                  active ? (isYolo ? 'text-orange-300/80' : 'text-emerald-300/80') : 'text-slate-500'
                }`}
              >
                {meta.sub}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-md bg-slate-950 px-3 py-2 text-xs">
        <span className="text-slate-500">Margin req. @ {leverage}x</span>
        <span className={`font-mono font-semibold ${notional / leverage > balance ? 'text-rose-400' : 'text-slate-200'}`}>
          {formatKrw(notional / leverage)}
        </span>
      </div>
    </div>
  );
}
