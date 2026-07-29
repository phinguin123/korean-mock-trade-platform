'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatCompact, formatNumber } from '@/lib/format';
import type { Tick } from '@/types/trading';

interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

const BUCKET = 3;
const AXIS_W = 62;
const VOL_RATIO = 0.22;

function buildCandles(ticks: Tick[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i + BUCKET <= ticks.length; i += BUCKET) {
    const slice = ticks.slice(i, i + BUCKET);
    const prices = slice.map((t) => t.price);
    const high = Math.max(...prices);
    const low = Math.min(...prices);
    out.push({
      open: prices[0],
      close: prices[prices.length - 1],
      high,
      low,
      // Deterministic pseudo-volume derived from the candle's own range.
      volume: Math.round((high - low) * 42 + 12_000 + (slice[0].id % 7) * 2_400),
      time: slice[slice.length - 1].timestamp,
    });
  }
  return out;
}

/** Simple moving average, aligned to the end of each window. */
function sma(values: number[], window: number): (number | null)[] {
  let sum = 0;
  return values.map((v, i) => {
    sum += v;
    if (i >= window) sum -= values[i - window];
    return i >= window - 1 ? sum / window : null;
  });
}

function useSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, ...size };
}

export function CandleChart({ ticks, prevClose }: { ticks: Tick[]; prevClose: number }) {
  const { ref, width, height } = useSize<HTMLDivElement>();
  const candles = useMemo(() => buildCandles(ticks), [ticks]);

  const geometry = useMemo(() => {
    if (!candles.length || width <= 0 || height <= 0) return null;

    const plotW = Math.max(0, width - AXIS_W);
    const volH = height * VOL_RATIO;
    const priceH = height - volH - 14;

    const highs = candles.map((c) => c.high);
    const lows = candles.map((c) => c.low);
    const max = Math.max(...highs, prevClose);
    const min = Math.min(...lows, prevClose);
    const pad = (max - min) * 0.12 || 1;
    const top = max + pad;
    const bottom = min - pad;

    const step = plotW / candles.length;
    const bodyW = Math.max(2, Math.min(9, step * 0.62));
    const y = (price: number) => ((top - price) / (top - bottom)) * priceH;
    const x = (i: number) => i * step + step / 2;

    const maxVol = Math.max(...candles.map((c) => c.volume));
    const volY = (v: number) => volH - (v / maxVol) * volH;

    const closes = candles.map((c) => c.close);
    const line = (window: number) => {
      const series = sma(closes, window);
      return series
        .map((v, i) => (v === null ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`))
        .filter((p): p is string => p !== null)
        .join(' ');
    };

    const gridPrices = Array.from({ length: 5 }, (_, i) => top - ((top - bottom) / 4) * i);

    return {
      plotW,
      priceH,
      volH,
      step,
      bodyW,
      x,
      y,
      volY,
      maxVol,
      gridPrices,
      ma5: line(5),
      ma20: line(20),
    };
  }, [candles, width, height, prevClose]);

  const last = candles.at(-1);
  const lastUp = last ? last.close >= last.open : true;

  return (
    <div ref={ref} className="relative h-full w-full">
      {geometry && last && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Candlestick price chart"
          className="block"
        >
          {/* price grid */}
          {geometry.gridPrices.map((p) => (
            <g key={p}>
              <line
                x1={0}
                x2={geometry.plotW}
                y1={geometry.y(p)}
                y2={geometry.y(p)}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray="2 4"
                opacity={0.55}
              />
              <text
                x={width - 8}
                y={geometry.y(p) + 3.5}
                textAnchor="end"
                className="fill-muted-foreground text-[10px] tabular-nums"
              >
                {formatNumber(Math.round(p))}
              </text>
            </g>
          ))}

          {/* moving averages */}
          <polyline
            points={geometry.ma20}
            fill="none"
            stroke="var(--down)"
            strokeWidth={1.2}
            opacity={0.75}
          />
          <polyline
            points={geometry.ma5}
            fill="none"
            stroke="#e8a33d"
            strokeWidth={1.2}
            opacity={0.9}
          />

          {/* candles */}
          {candles.map((c, i) => {
            const up = c.close >= c.open;
            const color = up ? 'var(--up)' : 'var(--down)';
            const yHigh = geometry.y(c.high);
            const yLow = geometry.y(c.low);
            const yOpen = geometry.y(c.open);
            const yClose = geometry.y(c.close);
            const bodyTop = Math.min(yOpen, yClose);
            const bodyH = Math.max(1.5, Math.abs(yClose - yOpen));
            const cx = geometry.x(i);
            return (
              <g key={c.time}>
                <rect
                  x={cx - 0.5}
                  y={yHigh}
                  width={1}
                  height={Math.max(1, yLow - yHigh)}
                  fill={color}
                  opacity={0.9}
                />
                <rect
                  x={cx - geometry.bodyW / 2}
                  y={bodyTop}
                  width={geometry.bodyW}
                  height={bodyH}
                  fill={color}
                  rx={0.5}
                />
              </g>
            );
          })}

          {/* last price marker */}
          <line
            x1={0}
            x2={geometry.plotW}
            y1={geometry.y(last.close)}
            y2={geometry.y(last.close)}
            stroke={lastUp ? 'var(--up)' : 'var(--down)'}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <rect
            x={geometry.plotW + 2}
            y={geometry.y(last.close) - 9}
            width={AXIS_W - 10}
            height={18}
            rx={4}
            fill={lastUp ? 'var(--up)' : 'var(--down)'}
          />
          <text
            x={geometry.plotW + 2 + (AXIS_W - 10) / 2}
            y={geometry.y(last.close) + 4}
            textAnchor="middle"
            className="fill-white text-[10px] font-bold tabular-nums"
          >
            {formatNumber(last.close)}
          </text>

          {/* volume */}
          <g transform={`translate(0, ${geometry.priceH + 14})`}>
            {candles.map((c, i) => {
              const up = c.close >= c.open;
              const yv = geometry.volY(c.volume);
              return (
                <rect
                  key={`v-${c.time}`}
                  x={geometry.x(i) - geometry.bodyW / 2}
                  y={yv}
                  width={geometry.bodyW}
                  height={Math.max(1, geometry.volH - yv)}
                  fill={up ? 'var(--up)' : 'var(--down)'}
                  opacity={0.45}
                  rx={0.5}
                />
              );
            })}
            <text
              x={width - 8}
              y={12}
              textAnchor="end"
              className="fill-muted-foreground text-[10px] tabular-nums"
            >
              {formatCompact(geometry.maxVol)}
            </text>
          </g>
        </svg>
      )}

      <div className="pointer-events-none absolute left-0 top-0 flex items-center gap-3 text-[10px] font-semibold">
        <span className="text-muted-foreground">MA</span>
        <span className="flex items-center gap-1 text-[#e8a33d]">
          <span className="h-0.5 w-3 rounded-full bg-current" />5
        </span>
        <span className="flex items-center gap-1 text-down">
          <span className="h-0.5 w-3 rounded-full bg-current" />
          20
        </span>
      </div>
    </div>
  );
}
