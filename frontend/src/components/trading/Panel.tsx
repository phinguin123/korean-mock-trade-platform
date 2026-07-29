'use client';

import { GripVertical, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Toss-style workspace panel: a raised dark surface topped by a drag handle,
 * a closable pill tab and an "add panel" affordance.
 */
export function Panel({
  title,
  actions,
  children,
  bodyClassName = '',
  className = '',
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
  className?: string;
}) {
  return (
    <section
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-toss ${className}`}
    >
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-border/60 px-2.5">
        <GripVertical size={14} className="shrink-0 text-muted-foreground/60" aria-hidden />
        <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-secondary px-2.5 py-1.5">
          <span className="truncate text-[13px] font-bold text-foreground">{title}</span>
          <X size={13} className="shrink-0 text-muted-foreground" aria-hidden />
        </div>
        <button
          type="button"
          aria-label={`Add panel next to ${title}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <Plus size={14} />
        </button>
        {actions ? <div className="ml-auto flex items-center gap-1.5">{actions}</div> : null}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/** Small square icon button used inside panel headers. */
export function PanelIconButton({
  label,
  children,
  onClick,
}: {
  label: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      {children}
    </button>
  );
}
