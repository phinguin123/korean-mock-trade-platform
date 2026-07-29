'use client';

import { AlertTriangle, Minus, Plus, Skull, TrendingDown, TrendingUp, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import type { Position } from '@/types/trading';

const EMPTY_POSITIONS: Position[] = [];

function formatKrw(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : '';
  return `${sign}₩${rounded.toLocaleString('ko-KR')}`;
}

function formatPrice(value: number): string {
  return `₩${Math.round(value).toLocaleString('ko-KR')}`;
}

/** Long: price * (1 - 1/lev). Short: price * (1 + 1/lev). Mirrors MatchingEngine. */
function estimateLiquidationPrice(price: number, leverage: number, side: 'BUY' | 'SELL'): number {
  const factor = 1 / leverage;
  return side === 'BUY' ? price * (1 - factor) : price * (1 + factor);
}

function PositionRow({ position, currentPrice }: { position: Position; currentPrice: number }) {
  const closePosition = useMarketData((s) => s.closePosition);
  const isLong = position.side === 'BUY';

  const unrealizedPnl = isLong
    ? (currentPrice - position.entryPrice) * position.qty
    : (position.entryPrice - currentPrice) * position.qty;

  const pnlPct = position.margin > 0 ? (unrealizedPnl / position.margin) * 100 : 0;
  const isProfit = unrealizedPnl >= 0;

  const distanceToLiqPct =
    isLong
      ? ((currentPrice - position.liquidationPrice) / currentPrice) * 100
      : ((position.liquidationPrice - currentPrice) / currentPrice) * 100;
  const nearLiquidation = distanceToLiqPct < 15;

  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 p-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${
              isLong ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
            }`}
          >
            {isLong ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {isLong ? 'LONG' : 'SHORT'} {position.leverage}x
          </span>
          <span className="font-mono text-[11px] text-slate-500">qty {position.qty}</span>
        </div>
        <button
          type="button"
          onClick={() => closePosition(position.id)}
          className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] font-semibold text-slate-300 transition-colors hover:bg-slate-700"
        >
          <X size={10} /> Close
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1 text-[11px]">
        <div>
          <p className="text-slate-500">Entry</p>
          <p className="font-mono text-slate-300">{formatPrice(position.entryPrice)}</p>
        </div>
        <div>
          <p className="text-slate-500">Liq. Price</p>
          <p className={`font-mono ${nearLiquidation ? 'text-rose-400' : 'text-slate-300'}`}>
            {formatPrice(position.liquidationPrice)}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Unrealized</p>
          <p className={`font-mono font-semibold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
            {formatKrw(unrealizedPnl)}
          </p>
        </div>
      </div>

      <div className="mt-1.5 flex items-center justify-between text-[10px]">
        <span className={isProfit ? 'text-emerald-500/80' : 'text-rose-500/80'}>
          {isProfit ? '+' : ''}
          {pnlPct.toFixed(1)}% of margin
        </span>
        {nearLiquidation && (
          <span className="flex items-center gap-1 font-semibold text-rose-400">
            <AlertTriangle size={10} /> Near liquidation
          </span>
        )}
      </div>
    </div>
  );
}

export function OrderPanel() {
  const symbol = useMarketData((s) => s.symbol);
  const currentPrice = useMarketData((s) => s.market?.currentPrice) ?? 0;
  const leverage = useMarketData((s) => s.leverage);
  const orderQty = useMarketData((s) => s.orderQty);
  const setOrderQty = useMarketData((s) => s.setOrderQty);
  const placeOrder = useMarketData((s) => s.placeOrder);
  const balance = useMarketData((s) => s.portfolio?.balance) ?? 0;
  const equity = useMarketData((s) => s.portfolio?.equity) ?? 0;
  const positions = useMarketData((s) => s.portfolio?.positions) ?? EMPTY_POSITIONS;
  const lastRejectReason = useMarketData((s) => s.lastRejectReason);
  const clearRejectReason = useMarketData((s) => s.clearRejectReason);

  const [qtyInput, setQtyInput] = useState('1');

  useEffect(() => {
    if (!lastRejectReason) return;
    const t = setTimeout(() => clearRejectReason(), 4000);
    return () => clearTimeout(t);
  }, [lastRejectReason, clearRejectReason]);

  const openPositions = useMemo(
    () => positions.filter((p) => p.status === 'OPEN' && p.symbol === symbol),
    [positions, symbol],
  );

  const notional = orderQty * currentPrice;
  const requiredMargin = leverage > 0 ? notional / leverage : 0;
  const longLiqPrice = estimateLiquidationPrice(currentPrice, leverage, 'BUY');
  const shortLiqPrice = estimateLiquidationPrice(currentPrice, leverage, 'SELL');
  const insufficientMargin = requiredMargin > balance || orderQty <= 0;

  function commitQty(next: number) {
    const clamped = Math.max(0, Math.round(next * 100) / 100);
    setOrderQty(clamped);
    setQtyInput(String(clamped));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Execute</h2>
        <div className="text-right text-[11px] text-slate-500">
          <p>
            Cash <span className="font-mono text-slate-300">{formatPrice(balance)}</span>
          </p>
          <p>
            Equity <span className="font-mono text-slate-300">{formatPrice(equity)}</span>
          </p>
        </div>
      </div>

      {/* Quantity stepper */}
      <div>
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-slate-500">Quantity</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => commitQty(orderQty - 1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-800 bg-slate-950 text-slate-300 transition-colors hover:bg-slate-800"
          >
            <Minus size={14} />
          </button>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={qtyInput}
            onChange={(e) => {
              setQtyInput(e.target.value);
              const parsed = Number(e.target.value);
              if (Number.isFinite(parsed) && parsed >= 0) setOrderQty(parsed);
            }}
            onBlur={() => commitQty(Number(qtyInput) || 0)}
            className="h-9 w-full rounded-md border border-slate-800 bg-slate-950 text-center font-mono text-sm text-slate-100 outline-none focus:border-slate-600"
          />
          <button
            type="button"
            onClick={() => commitQty(orderQty + 1)}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-800 bg-slate-950 text-slate-300 transition-colors hover:bg-slate-800"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Live calc summary */}
      <div className="grid grid-cols-2 gap-2 rounded-md bg-slate-950 p-2.5 text-[11px]">
        <div>
          <p className="text-slate-500">Notional</p>
          <p className="font-mono text-slate-300">{formatPrice(notional)}</p>
        </div>
        <div>
          <p className="text-slate-500">Required Margin</p>
          <p className={`font-mono font-semibold ${insufficientMargin ? 'text-rose-400' : 'text-slate-200'}`}>
            {formatPrice(requiredMargin)}
          </p>
        </div>
        <div>
          <p className="text-slate-500">Est. Liq. (Long)</p>
          <p className="font-mono text-emerald-400/80">{formatPrice(longLiqPrice)}</p>
        </div>
        <div>
          <p className="text-slate-500">Est. Liq. (Short)</p>
          <p className="font-mono text-rose-400/80">{formatPrice(shortLiqPrice)}</p>
        </div>
      </div>

      {insufficientMargin && (
        <div className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-400">
          <AlertTriangle size={12} />
          Insufficient balance for this size/leverage.
        </div>
      )}

      {lastRejectReason && (
        <div className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2.5 py-1.5 text-[11px] font-medium text-rose-400">
          <Skull size={12} />
          {lastRejectReason}
        </div>
      )}

      {/* One-tap execution */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={insufficientMargin}
          onClick={() => placeOrder('BUY')}
          className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-emerald-500 py-3 font-bold text-slate-950 transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
        >
          <span className="flex items-center gap-1 text-sm">
            <TrendingUp size={16} /> BUY / LONG
          </span>
          <span className="text-[10px] font-normal opacity-80">{leverage}x</span>
        </button>
        <button
          type="button"
          disabled={insufficientMargin}
          onClick={() => placeOrder('SELL')}
          className="flex flex-col items-center justify-center gap-0.5 rounded-md bg-rose-500 py-3 font-bold text-slate-950 transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-600"
        >
          <span className="flex items-center gap-1 text-sm">
            <TrendingDown size={16} /> SELL / SHORT
          </span>
          <span className="text-[10px] font-normal opacity-80">{leverage}x</span>
        </button>
      </div>

      {/* Position summary */}
      <div className="mt-1 flex flex-col gap-2">
        <h3 className="text-[10px] uppercase tracking-wider text-slate-500">
          Open Positions {openPositions.length > 0 && `(${openPositions.length})`}
        </h3>
        {openPositions.length === 0 ? (
          <p className="rounded-md border border-dashed border-slate-800 py-4 text-center text-[11px] text-slate-600">
            No open positions on {symbol}
          </p>
        ) : (
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-0.5">
            {openPositions.map((position) => (
              <PositionRow key={position.id} position={position} currentPrice={currentPrice} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
