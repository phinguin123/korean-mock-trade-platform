'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { formatSignedWon } from '@/lib/format';
import type { DopamineEvent } from '@/types/trading';

// ---------------------------------------------------------------------------
// Tiny Web Audio synth — soft chime on positive events, muted thud otherwise.
// ---------------------------------------------------------------------------

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor();
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

function tone(
  ctx: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  type: OscillatorType,
  peak: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

function play(kind: DopamineEvent['kind']) {
  const ctx = getCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  if (kind === 'profit' || kind === 'long') {
    [880, 1108.73, 1318.51].forEach((f, i) => tone(ctx, f, now + i * 0.06, 0.2, 'triangle', 0.12));
  } else {
    tone(ctx, 240, now, 0.24, 'sine', 0.1);
    tone(ctx, 170, now + 0.05, 0.28, 'sine', 0.09);
  }
}

const DISMISS_MS = 1500;

function Bubble({ event, onDone }: { event: DopamineEvent; onDone: (id: string) => void }) {
  const positive = event.kind === 'profit' || event.kind === 'long';

  useEffect(() => {
    const t = setTimeout(() => onDone(event.id), DISMISS_MS);
    return () => clearTimeout(t);
  }, [event.id, onDone]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.96 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="pointer-events-none flex flex-col items-center gap-1 rounded-2xl bg-card px-5 py-3 shadow-toss-lg"
    >
      {event.amount !== 0 && (
        <span
          className={`text-[22px] font-bold tabular-nums ${positive ? 'text-up' : 'text-down'}`}
        >
          {formatSignedWon(event.amount)}
        </span>
      )}
      <span className="text-[13px] font-semibold text-secondary-foreground">{event.label}</span>
    </motion.div>
  );
}

/** Floating feedback toasts, centered over the trade panel. */
export function DopamineEffects() {
  const effects = useMarketData((s) => s.effects);
  const dismissEffect = useMarketData((s) => s.dismissEffect);
  const played = useRef(new Set<string>());

  useEffect(() => {
    for (const effect of effects) {
      if (played.current.has(effect.id)) continue;
      played.current.add(effect.id);
      play(effect.kind);
    }
  }, [effects]);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex flex-col items-center gap-2 px-5">
      <AnimatePresence>
        {effects.map((event) => (
          <Bubble key={event.id} event={event} onDone={dismissEffect} />
        ))}
      </AnimatePresence>
    </div>
  );
}
