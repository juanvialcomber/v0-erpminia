'use client';

import { Database } from 'lucide-react';
import { cn } from '@/lib/utils';

export type LaudusSourceVisualState = 'connected' | 'syncing' | 'review' | 'offline' | 'pending';

const STATE_META: Record<LaudusSourceVisualState, { label: string; dot: string }> = {
  connected: { label: 'Conectado', dot: 'bg-emerald-500' },
  syncing: { label: 'Actualizando', dot: 'bg-sky-500 animate-pulse' },
  review: { label: 'Revisar', dot: 'bg-amber-500' },
  offline: { label: 'Sin conexión', dot: 'bg-destructive' },
  pending: { label: 'Pendiente', dot: 'bg-muted-foreground/60' },
};

export function LaudusSourceMark({
  state = 'connected',
  compact = false,
  className,
}: {
  state?: LaudusSourceVisualState;
  compact?: boolean;
  className?: string;
}) {
  const meta = STATE_META[state];

  if (compact) {
    return (
      <span
        className={cn('relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-background', className)}
        aria-label={`Laudus · ${meta.label}`}
        title={`Laudus · ${meta.label}`}
      >
        <Database className="h-3.5 w-3.5 text-foreground" />
        <span className={cn('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-background', meta.dot)} aria-hidden="true" />
      </span>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5', className)}
      aria-label={`Laudus · ${meta.label}`}
    >
      <span className="relative inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-card">
        <Database className="h-3.5 w-3.5 text-foreground" />
        <span className={cn('absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ring-2 ring-background', meta.dot)} aria-hidden="true" />
      </span>
      <span className="text-xs font-semibold">Laudus</span>
      <span className="text-[11px] text-muted-foreground">{meta.label}</span>
    </span>
  );
}
