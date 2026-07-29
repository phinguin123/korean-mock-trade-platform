'use client';

import { motion } from 'framer-motion';
import { Bell, ChevronDown, Heart, PanelRight, User } from 'lucide-react';
import { useMarketData } from '@/hooks/useMarketData';
import { formatCompact, formatNumber, formatWon } from '@/lib/format';

/** Label + low/high values with a track showing where price sits in the range. */
function RangeStat({
  label,
  low,
  high,
  current,
}: {
  label: string;
  low: number;
  high: number;
  current: number;
}) {
  const span = high - low;
  const pct = span > 0 ? Math.min(100, Math.max(0, ((current - low) / span) * 100)) : 50;

  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[62px] shrink-0 text-[12px] font-medium text-muted-foreground">
        {label}
      </span>
      <span className="w-[74px] shrink-0 text-right text-[12px] font-semibold tabular-nums text-foreground">
        {formatNumber(low)}
      </span>
      <span className="relative h-[3px] w-16 shrink-0 rounded-full bg-secondary" aria-hidden>
        <span
          className="absolute top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-foreground"
          style={{ left: `calc(${pct}% - 4px)` }}
        />
      </span>
      <span className="w-[74px] shrink-0 text-[12px] font-semibold tabular-nums text-foreground">
        {formatNumber(high)}
      </span>
    </div>
  );
}

function PairStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}

export function TickerBar({
  panelsVisible,
  onTogglePanels,
}: {
  panelsVisible: boolean;
  onTogglePanels: () => void;
}) {
  const symbol = useMarketData((s) => s.symbol);
  const name = useMarketData((s) => s.market?.name) ?? 'Loading';
  const currentPrice = useMarketData((s) => s.market?.currentPrice);
  const prevClose = useMarketData((s) => s.market?.prevClose) ?? 0;
  const changePercent = useMarketData((s) => s.market?.changePercent) ?? 0;
  const high = useMarketData((s) => s.market?.high) ?? 0;
  const low = useMarketData((s) => s.market?.low) ?? 0;
  const totalVolume = useMarketData((s) => s.market?.totalVolume) ?? 0;
  const bestBid = useMarketData((s) => s.market?.orderBook.bids[0]?.price);
  const bestAsk = useMarketData((s) => s.market?.orderBook.asks[0]?.price);
  const balance = useMarketData((s) => s.portfolio.balance);

  const price = currentPrice ?? prevClose;
  const isUp = changePercent >= 0;
  const diff = price - prevClose;
  const tone = isUp ? 'text-up' : 'text-down';

  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4 border-b border-border bg-background px-4 py-3">
      <div className="flex items-center gap-2.5 self-center">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[13px] font-bold text-primary-foreground">
          T
        </span>
      </div>

      <div className="flex min-w-0 flex-col gap-1.5">
        <button
          type="button"
          className="flex w-fit items-center gap-2 rounded-xl border border-border bg-card py-1.5 pl-1.5 pr-2.5 transition-colors hover:border-muted-foreground/40"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-up/20 text-[10px] font-bold text-up">
            SE
          </span>
          <span className="truncate text-[13px] font-bold text-foreground">{name}</span>
          <span className="text-[12px] font-semibold text-muted-foreground">{symbol}</span>
          <ChevronDown size={14} className="text-muted-foreground" aria-hidden />
        </button>

        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <motion.span
            key={price}
            initial={{ opacity: 0.6 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.16 }}
            className="text-[26px] font-bold leading-none tracking-tight tabular-nums text-foreground"
          >
            {formatNumber(price)}
            <span className="ml-0.5 text-[16px] font-semibold text-muted-foreground">원</span>
          </motion.span>
          <span className="text-[12px] font-medium text-muted-foreground">vs prev close</span>
          <span className={`text-[13px] font-bold tabular-nums ${tone}`}>
            {isUp ? '+' : '-'}
            {formatNumber(Math.abs(diff))}원 ({Math.abs(changePercent).toFixed(2)}%)
          </span>
        </div>
      </div>

      <div className="hidden flex-col gap-1.5 xl:flex">
        <RangeStat label="Day range" low={low} high={high} current={price} />
        <RangeStat
          label="52w range"
          low={Math.round(low * 0.62)}
          high={Math.round(high * 1.44)}
          current={price}
        />
      </div>

      <div className="hidden w-[160px] flex-col gap-1.5 lg:flex">
        <PairStat label="Best bid / ask" value={`${formatNumber(bestBid ?? 0)} / ${formatNumber(bestAsk ?? 0)}`} />
        <PairStat label="Turnover" value={formatCompact(totalVolume * 74)} />
      </div>

      <div className="hidden w-[140px] flex-col gap-1.5 lg:flex">
        <PairStat label="Rank" value="4th" />
        <PairStat label="Dividend yield" value="1.94%" />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <div className="hidden flex-col items-end gap-0.5 sm:flex">
          <span className="text-[11px] font-medium text-muted-foreground">Buying power</span>
          <span className="text-[13px] font-bold tabular-nums text-foreground">
            {formatWon(balance)}
          </span>
        </div>

        <button
          type="button"
          aria-label="Price alerts"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-colors hover:text-foreground"
        >
          <Bell size={15} />
        </button>
        <button
          type="button"
          aria-label="Add to watchlist"
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-muted-foreground transition-colors hover:text-up"
        >
          <Heart size={15} />
        </button>
        <div className="hidden items-center rounded-xl bg-secondary p-0.5 sm:flex">
          <span className="rounded-lg px-2.5 py-1 text-[12px] font-semibold text-muted-foreground">
            $
          </span>
          <span className="rounded-lg bg-primary px-2.5 py-1 text-[12px] font-bold text-primary-foreground">
            원
          </span>
        </div>
        <button
          type="button"
          aria-pressed={panelsVisible}
          onClick={onTogglePanels}
          className={`hidden items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition-colors md:flex ${
            panelsVisible
              ? 'border-border bg-secondary text-foreground'
              : 'border-border bg-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <PanelRight size={14} aria-hidden />
          Edit panels
        </button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground">
          <User size={15} />
        </span>
      </div>
    </div>
  );
}
