'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Activity, TrendingDown, TrendingUp, Wifi, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import type { ConnectionStatus, Tick } from '@/types/trading';

const TICK_STREAM_LENGTH = 20;
const EMPTY_TICKS: Tick[] = [];

function formatPrice(price: number): string {
  return Math.round(price).toLocaleString('ko-KR');
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `${(volume / 1_000_000).toFixed(2)}M`;
  if (volume >= 1_000) return `${(volume / 1_000).toFixed(1)}K`;
  return volume.toLocaleString('ko-KR');
}

const STATUS_META: Record<ConnectionStatus, { label: string; dot: string; icon: 'wifi' | 'wifi-off' }> = {
  open: { label: 'LIVE', dot: 'bg-emerald-400', icon: 'wifi' },
  connecting: { label: 'CONNECTING', dot: 'bg-amber-400 animate-pulse', icon: 'wifi-off' },
  reconnecting: { label: 'RECONNECTING', dot: 'bg-amber-400 animate-pulse', icon: 'wifi-off' },
  closed: { label: 'OFFLINE', dot: 'bg-rose-500', icon: 'wifi-off' },
};

function TickChip({ tick }: { tick: Tick }) {
  const isBuy = tick.side === 'BUY';
  return (
    <motion.span
      initial={{ opacity: 0, x: 12, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.85 }}
      transition={{ duration: 0.18 }}
      className={`inline-flex shrink-0 items-center rounded px-1.5 py-0.5 font-mono text-[11px] tabular-nums ${
        isBuy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
      }`}
    >
      {formatPrice(tick.price)}
    </motion.span>
  );
}

export function PriceHeader() {
  const symbol = useMarketData((s) => s.symbol);
  const name = useMarketData((s) => s.market?.name) ?? 'Loading…';
  const currentPrice = useMarketData((s) => s.market?.currentPrice);
  const changePercent = useMarketData((s) => s.market?.changePercent) ?? 0;
  const totalVolume = useMarketData((s) => s.market?.totalVolume) ?? 0;
  const recentTicks = useMarketData((s) => s.market?.recentTicks) ?? EMPTY_TICKS;
  const tickDirection = useMarketData((s) => s.tickDirection);
  const status = useMarketData((s) => s.status);
  const latencyMs = useMarketData((s) => s.latencyMs);

  const streamTicks = useMemo(() => recentTicks.slice(-TICK_STREAM_LENGTH), [recentTicks]);
  const meta = STATUS_META[status];
  const isUp = changePercent >= 0;

  const flashBg =
    tickDirection === 'up'
      ? 'bg-emerald-500/10'
      : tickDirection === 'down'
        ? 'bg-rose-500/10'
        : 'bg-transparent';

  return (
    <header className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-800 font-mono text-xs font-bold text-slate-300">
            {symbol.slice(0, 3)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-slate-100">{name}</h1>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                {symbol}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">Vol {formatVolume(totalVolume)}</p>
          </div>
        </div>

        <div className={`flex items-center gap-3 rounded-md px-3 py-1.5 transition-colors duration-150 ${flashBg}`}>
          <span
            className={`font-mono text-3xl font-bold tabular-nums transition-colors duration-150 ${
              tickDirection === 'up'
                ? 'text-emerald-400'
                : tickDirection === 'down'
                  ? 'text-rose-400'
                  : 'text-slate-50'
            }`}
          >
            ₩{currentPrice !== undefined ? formatPrice(currentPrice) : '—'}
          </span>
          <span
            className={`flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold ${
              isUp ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
            }`}
          >
            {isUp ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {isUp ? '+' : ''}
            {changePercent.toFixed(2)}%
          </span>
        </div>

        <div className="flex items-center gap-3">
          {latencyMs !== null && (
            <span className="hidden items-center gap-1 text-[11px] text-slate-500 sm:flex">
              <Activity size={12} />
              {latencyMs}ms
            </span>
          )}
          <span className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-slate-300">
            {meta.icon === 'wifi' ? <Wifi size={12} className="text-emerald-400" /> : <WifiOff size={12} className="text-amber-400" />}
            <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto border-t border-slate-800/70 pt-2">
        <span className="mr-1 shrink-0 text-[10px] uppercase tracking-wider text-slate-500">Tape</span>
        <AnimatePresence initial={false} mode="popLayout">
          {streamTicks.map((tick) => (
            <TickChip key={`${tick.timestamp}-${tick.price}`} tick={tick} />
          ))}
        </AnimatePresence>
      </div>
    </header>
  );
}
