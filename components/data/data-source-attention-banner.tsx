'use client';

import Link from 'next/link';
import { ArrowRight, WifiOff } from 'lucide-react';
import { useDataSourceStatus } from '@/hooks/use-data-source-status';

export function DataSourceAttentionBanner() {
  const { data, isLoading, error } = useDataSourceStatus();

  if (isLoading || error || !data) return null;

  const affected = data.sources.filter((source) => source.state === 'offline');
  if (!affected.length) return null;

  return (
    <section className="rounded-lg border border-border bg-card px-4 py-3" aria-label="Estado de conexión">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              Hay una fuente sin conexión
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {affected.map((source) => source.label).join(' · ')}
            </p>
          </div>
        </div>
        <Link href="/dashboard/calidad-datos" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
          Ver estado
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
