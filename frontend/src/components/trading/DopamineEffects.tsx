'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import type { DopamineEvent } from '@/types/trading';

// ---------------------------------------------------------------------------
// Web Audio synth — no external audio files. A tiny oscillator + gain
// envelope stack that fakes a "cash register" chime (profit / long) or a
// dull thud (loss / short) purely from synthesized frequencies.
// ---------------------------------------------------------------------------

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedAudioCtx) sharedAudioCtx = new Ctor();
  if (sharedAudioCtx.state === 'suspended') void sharedAudioCtx.resume();
  return sharedAudioCtx;
}

function playTone(ctx: AudioContext, freq: number, startAt: number, duration: number, type: OscillatorType, peakGain: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

/** Bright ascending arpeggio — profit realized or a long entry filled. */
function playProfitChime(ctx: AudioContext) {
  const now = ctx.currentTime;
  const notes = [880, 1108.73, 1318.51]; // A5, C#6, E6 — major chime
  notes.forEach((freq, i) => playTone(ctx, freq, now + i * 0.07, 0.22, 'triangle', 0.18));
}

/** Low descending thud — loss realized or a short entry filled. */
function playLossThud(ctx: AudioContext) {
  const now = ctx.currentTime;
  playTone(ctx, 220, now, 0.28, 'sawtooth', 0.16);
  playTone(ctx, 164.81, now + 0.05, 0.32, 'sine', 0.14);
}

function playForKind(kind: DopamineEvent['kind']) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (kind === 'profit' || kind === 'long') playProfitChime(ctx);
  else playLossThud(ctx);
}

// ---------------------------------------------------------------------------
// Visuals
// ---------------------------------------------------------------------------

function formatSigned(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded >= 0 ? '+' : '-';
  return `${sign}₩${Math.abs(rounded).toLocaleString('ko-KR')}`;
}

const AUTO_DISMISS_MS = 1400;

function Particle({ event, onDone }: { event: DopamineEvent; onDone: (id: string) => void }) {
  const isPositive = event.kind === 'profit' || event.kind === 'long';

  useEffect(() => {
    const t = setTimeout(() => onDone(event.id), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [event.id, onDone]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.85 }}
      animate={{ opacity: 1, y: isPositive ? -64 : 48, scale: 1 }}
      exit={{ opacity: 0, y: isPositive ? -88 : 72, scale: 0.9 }}
      transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'easeOut' }}
      className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
    >
      <span
        className={`whitespace-nowrap rounded-full px-3 py-1 font-mono text-lg font-extrabold drop-shadow-lg ${
          isPositive ? 'text-emerald-400' : 'text-rose-400'
        }`}
        style={{ textShadow: '0 2px 12px rgba(0,0,0,0.6)' }}
      >
        {formatSigned(event.amount)}
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300/80">{event.label}</span>
    </motion.div>
  );
}

/**
 * Overlay of floating PnL particles anchored over the order panel, plus the
 * synthesized audio trigger. Mount once, absolutely positioned inside a
 * `relative` wrapper around <OrderPanel />.
 */
export function DopamineEffects() {
  const effects = useMarketData((s) => s.effects);
  const dismissEffect = useMarketData((s) => s.dismissEffect);
  const playedIds = useRef(new Set<string>());

  useEffect(() => {
    for (const effect of effects) {
      if (playedIds.current.has(effect.id)) continue;
      playedIds.current.add(effect.id);
      playForKind(effect.kind);
    }
  }, [effects]);

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-visible">
      <AnimatePresence>
        {effects.map((event) => (
          <Particle key={event.id} event={event} onDone={dismissEffect} />
        ))}
      </AnimatePresence>
    </div>
  );
}
