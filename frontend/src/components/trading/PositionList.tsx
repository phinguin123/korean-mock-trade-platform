'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Layers, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { formatNumber, formatSignedWon, formatWon } from '@/lib/format';
import type { Position } from '@/types/trading';
import { Panel } from './Panel';

function PositionCard({ position, currentPrice }: { position: Position; currentPrice: number }) {
  const closePosition = useMarketData((s) => s.closePosition);
  const isLong = position.side === 'BUY';

  const pnl = isLong
    ? (currentPrice - position.entryPrice) * position.qty
    : (position.entryPrice - currentPrice) * position.qty;
  const pnlPct = position.margin > 0 ? (pnl / position.margin) * 100 : 0;
  const isProfit = pnl >= 0;

  const distanceToLiq = isLong
    ? ((currentPrice - position.liquidationPrice) / currentPrice) * 100
    : ((position.liquidationPrice - currentPrice) / currentPrice) * 100;
  const nearLiquidation = distanceToLiq < 15;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="rounded-xl bg-secondary/70 p-3.5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold ${
              isLong ? 'bg-up-soft text-up' : 'bg-down-soft text-down'
            }`}
          >
            {isLong ? 'Long' : 'Short'} {position.leverage}x
          </span>
          <span className="text-[12px] font-medium text-muted-foreground">
            {formatNumber(position.qty)} shares
          </span>
        </div>
        <button
          type="button"
          onClick={() => closePosition(position.id)}
          className="rounded-lg bg-card px-2.5 py-1 text-[12px] font-semibold text-secondary-foreground shadow-toss transition-transform active:scale-95"
        >
          Close
        </button>
      </div>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex flex-col gap-0.5 text-[12px] font-medium text-muted-foreground">
          <span>
            Entry <span className="text-foreground">{formatNumber(position.entryPrice)}</span>
          </span>
          <span className={nearLiquidation ? 'text-destructive' : undefined}>
            Liq. <span className={nearLiquidation ? 'font-semibold' : 'text-foreground'}>
              {formatNumber(position.liquidationPrice)}
            </span>
          </span>
        </div>
        <div className="text-right">
          <p
            className={`text-[16px] font-bold tabular-nums ${isProfit ? 'text-up' : 'text-down'}`}
          >
            {formatSignedWon(pnl)}
          </p>
          <p className={`text-[12px] font-semibold tabular-nums ${isProfit ? 'text-up' : 'text-down'}`}>
            {isProfit ? '+' : ''}
            {pnlPct.toFixed(1)}%
          </p>
        </div>
      </div>

      {nearLiquidation && (
        <p className="mt-2.5 flex items-center gap-1.5 rounded-lg bg-up-soft px-2.5 py-1.5 text-[11px] font-semibold text-destructive">
          <TriangleAlert size={12} /> Close to liquidation
        </p>
      )}
    </motion.li>
  );
}

export function PositionList() {
  const currentPrice = useMarketData((s) => s.market?.currentPrice) ?? 0;
  const positions = useMarketData((s) => s.portfolio.positions);
  const equity = useMarketData((s) => s.portfolio.equity);

  const open = useMemo(() => positions.filter((p) => p.status === 'OPEN'), [positions]);
  const totalPnl = useMemo(
    () =>
      open.reduce(
        (acc, p) =>
          acc +
          (p.side === 'BUY'
            ? (currentPrice - p.entryPrice) * p.qty
            : (p.entryPrice - currentPrice) * p.qty),
        0,
      ),
    [open, currentPrice],
  );
  const isProfit = totalPnl >= 0;

  return (
    <Panel
      title="Holdings"
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto p-3.5"
      className="h-full"
    >
      <div className="flex items-start justify-between gap-4">
        <p className="text-[12px] font-medium text-muted-foreground">
          {open.length === 0 ? 'Nothing open right now' : `${open.length} position${open.length > 1 ? 's' : ''}`}
        </p>
        <div className="text-right">
          <p className="text-[15px] font-bold tabular-nums text-foreground">{formatWon(equity)}</p>
          {open.length > 0 && (
            <p
              className={`text-[12px] font-semibold tabular-nums ${isProfit ? 'text-up' : 'text-down'}`}
            >
              {formatSignedWon(totalPnl)}
            </p>
          )}
        </div>
      </div>

      {open.length === 0 ? (
        <div className="mt-3 flex flex-1 flex-col items-center justify-center gap-2 rounded-xl bg-secondary/50 px-5 py-8 text-center">
          <Layers size={22} className="text-muted-foreground/60" aria-hidden />
          <p className="text-[13px] font-medium text-muted-foreground">
            You don&apos;t own any shares yet.
          </p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2.5">
          <AnimatePresence initial={false}>
            {open.map((position) => (
              <PositionCard key={position.id} position={position} currentPrice={currentPrice} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  );
}
