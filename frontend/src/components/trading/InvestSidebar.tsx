'use client';

import { BarChart3, Search, Star, Wallet, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { formatNumber, formatSignedWon } from '@/lib/format';
import type { Position } from '@/types/trading';
import { Panel } from './Panel';

const TABS = [
  { key: 'watchlist', label: 'Watchlist', icon: Star },
  { key: 'search', label: 'Search', icon: Search },
  { key: 'account', label: 'Account', icon: Wallet },
  { key: 'reports', label: 'Reports', icon: BarChart3 },
  { key: 'live', label: 'Live', icon: Zap },
] as const;

function timeAgo(ts: number): string {
  const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  return `${Math.round(diffMin / 60)}h ago`;
}

function OrderRow({ position, currentPrice }: { position: Position; currentPrice: number }) {
  const isLong = position.side === 'BUY';
  const isOpen = position.status === 'OPEN';
  const pnl = isLong
    ? (currentPrice - position.entryPrice) * position.qty
    : (position.entryPrice - currentPrice) * position.qty;

  const statusLabel =
    position.status === 'OPEN' ? 'Filled' : position.status === 'LIQUIDATED' ? 'Liquidated' : 'Closed';

  return (
    <li className="flex items-center justify-between gap-2 border-b border-border/50 px-3 py-2.5 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          <span
            className={`text-[12px] font-bold ${isLong ? 'text-up' : 'text-down'}`}
          >
            {isLong ? 'Buy' : 'Sell'}
          </span>
          <span className="text-[12px] font-medium text-muted-foreground">
            {formatNumber(position.qty)}주 @ {formatNumber(position.entryPrice)}
          </span>
        </div>
        <span className="text-[11px] font-medium text-muted-foreground">
          {statusLabel} · {timeAgo(position.openedAt)}
        </span>
      </div>
      {isOpen ? (
        <span className={`shrink-0 text-[12px] font-bold tabular-nums ${pnl >= 0 ? 'text-up' : 'text-down'}`}>
          {formatSignedWon(pnl)}
        </span>
      ) : (
        <span className="shrink-0 rounded-md bg-secondary px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
          {statusLabel}
        </span>
      )}
    </li>
  );
}

export function InvestSidebar() {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('account');
  const positions = useMarketData((s) => s.portfolio.positions);
  const currentPrice = useMarketData((s) => s.market?.currentPrice) ?? 0;

  const history = useMemo(
    () => [...positions].sort((a, b) => b.openedAt - a.openedAt).slice(0, 20),
    [positions],
  );

  return (
    <Panel title="My investing" bodyClassName="flex min-h-0 flex-1 flex-col" className="h-full">
      <div className="flex items-center gap-0.5 border-b border-border/60 px-2 py-2">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
            title={label}
            className={`flex h-8 flex-1 items-center justify-center rounded-lg transition-colors ${
              tab === key
                ? 'bg-secondary text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon size={15} />
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <span className="text-[12px] font-bold text-foreground">Order activity</span>
        <span className="text-[11px] font-medium text-muted-foreground">{history.length}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <p className="px-4 py-10 text-center text-[12px] font-medium text-muted-foreground">
            대기중인 주문이 없어요
            <br />
            No pending orders
          </p>
        ) : (
          <ul>
            {history.map((position) => (
              <OrderRow key={position.id} position={position} currentPrice={currentPrice} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
