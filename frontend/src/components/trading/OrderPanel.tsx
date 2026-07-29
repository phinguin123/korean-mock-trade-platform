'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, CircleAlert, HelpCircle, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { liquidationPrice, useMarketData } from '@/hooks/useMarketData';
import { formatNumber, formatWon } from '@/lib/format';
import type { Side } from '@/types/trading';
import { LeverageSelector } from './LeverageSelector';
import { Panel } from './Panel';

const QUICK_RATIOS = [0.1, 0.25, 0.5, 1] as const;
const QUICK_LABELS = ['10%', '25%', '50%', 'Max'] as const;

/** Large Buy/Sell tab — sets the tone (red/blue) for the whole order form. */
function SideToggle({ side, onChange }: { side: Side; onChange: (side: Side) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Order side">
      <button
        type="button"
        aria-pressed={side === 'BUY'}
        onClick={() => onChange('BUY')}
        className={`h-10 rounded-xl text-[14px] font-bold transition-colors ${
          side === 'BUY'
            ? 'bg-up text-white'
            : 'bg-secondary text-muted-foreground hover:text-foreground'
        }`}
      >
        Buy
      </button>
      <button
        type="button"
        aria-pressed={side === 'SELL'}
        onClick={() => onChange('SELL')}
        className={`h-10 rounded-xl text-[14px] font-bold transition-colors ${
          side === 'SELL'
            ? 'bg-down text-white'
            : 'bg-secondary text-muted-foreground hover:text-foreground'
        }`}
      >
        Sell
      </button>
    </div>
  );
}

/** Label on the left, control on the right — the Toss order-form rhythm. */
function Field({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3">
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Segmented({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div
      className="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option)}
            className={`flex-1 rounded-md py-1.5 text-[12px] font-bold transition-colors ${
              active
                ? 'bg-card text-foreground shadow-toss'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/** Numeric input with unit suffix and −/+ steppers, matching Toss price rows. */
function StepperInput({
  value,
  onChange,
  unit,
  step,
  ariaLabel,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  unit?: string;
  step: number;
  ariaLabel: string;
  placeholder?: string;
}) {
  const nudge = (dir: 1 | -1) => {
    const parsed = Number(value) || 0;
    onChange(String(Math.max(0, parsed + dir * step)));
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-border bg-secondary/60 px-2.5 focus-within:border-primary">
        <input
          inputMode="decimal"
          aria-label={ariaLabel}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-full w-full min-w-0 bg-transparent text-right text-[13px] font-bold tabular-nums text-foreground outline-none placeholder:font-medium placeholder:text-muted-foreground"
        />
        {unit && (
          <span className="ml-1.5 shrink-0 text-[12px] font-semibold text-muted-foreground">
            {unit}
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label={`Decrease ${ariaLabel}`}
        onClick={() => nudge(-1)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/60 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        aria-label={`Increase ${ariaLabel}`}
        onClick={() => nudge(1)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/60 text-muted-foreground transition-colors hover:text-foreground"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export function OrderPanel() {
  const currentPrice = useMarketData((s) => s.market?.currentPrice) ?? 0;
  const leverage = useMarketData((s) => s.leverage);
  const orderQty = useMarketData((s) => s.orderQty);
  const setOrderQty = useMarketData((s) => s.setOrderQty);
  const placeOrder = useMarketData((s) => s.placeOrder);
  const balance = useMarketData((s) => s.portfolio.balance);
  const lastRejectReason = useMarketData((s) => s.lastRejectReason);
  const clearRejectReason = useMarketData((s) => s.clearRejectReason);
  const selectedPrice = useMarketData((s) => s.selectedPrice);

  const [side, setSide] = useState<Side>('BUY');
  const [priceMode, setPriceMode] = useState('Limit');
  const [unitMode, setUnitMode] = useState('Shares');
  const [qtyInput, setQtyInput] = useState(String(orderQty));
  const [priceInput, setPriceInput] = useState('');

  // Keep the limit field tracking the market until the user edits it.
  const [priceTouched, setPriceTouched] = useState(false);
  useEffect(() => {
    if (!priceTouched && currentPrice) setPriceInput(String(currentPrice));
  }, [currentPrice, priceTouched]);

  // Clicking a depth-of-book row fills the limit price, like a real terminal.
  const lastSelected = useRef<number | null>(null);
  useEffect(() => {
    if (selectedPrice === null || selectedPrice === lastSelected.current) return;
    lastSelected.current = selectedPrice;
    setPriceMode('Limit');
    setPriceTouched(true);
    setPriceInput(String(selectedPrice));
  }, [selectedPrice]);

  useEffect(() => {
    if (!lastRejectReason) return;
    const t = setTimeout(() => clearRejectReason(), 4000);
    return () => clearTimeout(t);
  }, [lastRejectReason, clearRejectReason]);

  const notional = orderQty * currentPrice;
  const requiredMargin = leverage > 0 ? notional / leverage : 0;
  const insufficient = requiredMargin > balance || orderQty <= 0;

  function commitQty(raw: string) {
    setQtyInput(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) setOrderQty(parsed);
  }

  function applyRatio(ratio: number) {
    if (!currentPrice) return;
    const next = Math.floor(((balance * ratio) / currentPrice) * leverage);
    setOrderQty(next);
    setQtyInput(String(next));
  }

  return (
    <Panel title="Order" bodyClassName="flex flex-col gap-3.5 p-3.5">
      <SideToggle side={side} onChange={setSide} />

      <Field label="Order type">
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-secondary/60 px-3 text-[13px] font-semibold text-foreground transition-colors hover:border-muted-foreground/40"
        >
          Standard order
          <ChevronDown size={14} className="text-muted-foreground" aria-hidden />
        </button>
      </Field>

      <Field label="Unit">
        <Segmented
          options={['Shares', 'Fractional']}
          value={unitMode}
          onChange={setUnitMode}
          label="Order unit"
        />
      </Field>

      <Field label="Leverage">
        <LeverageSelector />
      </Field>

      <Field label="Price">
        <Segmented
          options={['Limit', 'Market']}
          value={priceMode}
          onChange={setPriceMode}
          label="Price type"
        />
      </Field>

      <Field label="">
        <StepperInput
          value={priceMode === 'Market' ? String(currentPrice) : priceInput}
          onChange={(v) => {
            setPriceTouched(true);
            setPriceInput(v);
          }}
          unit="원"
          step={100}
          ariaLabel="Limit price"
        />
      </Field>

      <Field label="Quantity">
        <StepperInput
          value={qtyInput}
          onChange={commitQty}
          step={1}
          ariaLabel="Order quantity"
          placeholder="Enter quantity"
        />
      </Field>

      <Field label="">
        <div className="grid grid-cols-4 gap-1.5">
          {QUICK_RATIOS.map((ratio, i) => (
            <button
              key={ratio}
              type="button"
              onClick={() => applyRatio(ratio)}
              className="rounded-lg border border-border bg-secondary/60 py-1.5 text-[12px] font-bold text-secondary-foreground transition-colors hover:border-muted-foreground/40 hover:text-foreground"
            >
              {QUICK_LABELS[i]}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Order total">
        <div className="flex h-9 items-center justify-end rounded-lg border border-border bg-secondary/60 px-2.5">
          <span className="text-[13px] font-bold tabular-nums text-foreground">
            {formatWon(notional)}
          </span>
        </div>
      </Field>

      <div className="grid grid-cols-[84px_minmax(0,1fr)] gap-3">
        <span />
        <div className="flex flex-col gap-1.5 text-[11px] font-medium">
          <span className="flex items-center gap-1 text-muted-foreground">
            Buying power {formatWon(balance)}
            <HelpCircle size={12} aria-hidden />
          </span>
          <span className="flex items-center justify-between tabular-nums">
            <span className="text-muted-foreground">Margin required</span>
            <span className={insufficient ? 'text-destructive' : 'text-foreground'}>
              {formatWon(requiredMargin)}
            </span>
          </span>
          <span className="flex items-center justify-between tabular-nums">
            <span className="text-muted-foreground">Liquidation L / S</span>
            <span className="text-foreground">
              {leverage === 1 ? '—' : formatNumber(liquidationPrice(currentPrice, leverage, 'BUY'))}
              {' / '}
              {formatNumber(liquidationPrice(currentPrice, leverage, 'SELL'))}
            </span>
          </span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {(insufficient || lastRejectReason) && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="flex items-center gap-1.5 rounded-lg bg-up-soft px-3 py-2 text-[12px] font-semibold text-destructive"
          >
            <CircleAlert size={13} className="shrink-0" />
            {lastRejectReason ?? 'Enter a quantity your buying power supports.'}
          </motion.p>
        )}
      </AnimatePresence>

      <button
        type="button"
        disabled={insufficient}
        onClick={() => placeOrder(side)}
        className={`mt-auto h-12 rounded-xl text-[15px] font-bold text-white transition-opacity hover:opacity-90 active:scale-[0.99] disabled:bg-secondary disabled:text-muted-foreground disabled:opacity-100 ${
          side === 'BUY' ? 'bg-up' : 'bg-down'
        }`}
      >
        {side === 'BUY' ? 'Buy' : 'Sell'}
      </button>
    </Panel>
  );
}
