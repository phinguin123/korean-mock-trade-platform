'use client';

import { motion } from 'framer-motion';
import { useMarketData } from '@/hooks/useMarketData';
import { ALLOWED_LEVERAGES } from '@/types/trading';

/** Compact segmented control with a sliding blue active pill. */
export function LeverageSelector() {
  const leverage = useMarketData((s) => s.leverage);
  const setLeverage = useMarketData((s) => s.setLeverage);

  return (
    <div
      className="flex w-full items-center gap-0.5 rounded-lg bg-secondary p-0.5"
      role="group"
      aria-label="Leverage"
    >
      {ALLOWED_LEVERAGES.map((lev) => {
        const active = leverage === lev;
        return (
          <button
            key={lev}
            type="button"
            aria-pressed={active}
            onClick={() => setLeverage(lev)}
            className={`relative flex-1 rounded-md py-1.5 text-[12px] font-bold tabular-nums transition-colors ${
              active ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {active && (
              <motion.span
                layoutId="leverage-pill"
                transition={{ type: 'spring', stiffness: 480, damping: 34 }}
                className="absolute inset-0 rounded-md bg-primary"
              />
            )}
            <span className="relative z-10">{lev}x</span>
          </button>
        );
      })}
    </div>
  );
}
