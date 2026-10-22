'use client';

import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Clock3, Database, RefreshCw, WifiOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type DataSourceState = 'updated' | 'syncing' | 'review' | 'offline' | 'pending';

export type DataSourceItem = {
  key: string;
  label: string;
  state: DataSourceState;
  detail?: string;
  updatedAt?: string | null;
  reviewCount?: number;
};

const LABELS: Record<DataSourceState, string> = {
  updated: 'Actualizado',
  syncing: 'Actualizando',
  review: 'Requiere revisión',
  offline: 'Sin conexión',
  pending: 'Pendiente',
};

function iconFor(state: DataSourceState) {
  if (state === 'updated') return CheckCircle2;
  if (state === 'syncing') return RefreshCw;
  if (state === 'review') return AlertTriangle;
  if (state === 'offline') return WifiOff;
  return Clock3;
}

function formatUpdatedAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  }).format(date);
}

function badgeVariant(state: DataSourceState): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (state === 'offline') return 'destructive';
  if (state === 'review') return 'outline';
  if (state === 'updated') return 'secondary';
  return 'outline';
}

export function DataSourceStatusStrip({
  sources,
  reviewHref = '/dashboard/calidad-datos',
  className,
}: {
  sources: DataSourceItem[];
  reviewHref?: string;
  className?: string;
}) {
  return (
    <section className={cn('rounded-lg border bg-card', className)} aria-label="Estado de fuentes de datos">
      <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Fuentes de datos</p>
            <p className="text-xs text-muted-foreground">Estado de actualización y excepciones. La procedencia queda disponible en el detalle.</p>
          </div>
        </div>
        <Link href={reviewHref} className="text-xs font-medium text-primary hover:underline">Revisar calidad</Link>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        {sources.map((source) => {
          const Icon = iconFor(source.state);
          return (
            <div key={source.key} className="bg-card px-4 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Icon className={cn('h-4 w-4 shrink-0 text-muted-foreground', source.state === 'syncing' && 'animate-spin')} />
                  <p className="truncate text-sm font-medium">{source.label}</p>
                </div>
                <Badge variant={badgeVariant(source.state)} className="shrink-0">{LABELS[source.state]}</Badge>
              </div>
              {source.detail ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{source.detail}</p> : null}
              {source.updatedAt || (source.reviewCount ?? 0) > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  {source.updatedAt ? <span>Actualizado {formatUpdatedAt(source.updatedAt)}</span> : null}
                  {(source.reviewCount ?? 0) > 0 ? <span>{source.reviewCount} revisión{source.reviewCount === 1 ? '' : 'es'}</span> : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
