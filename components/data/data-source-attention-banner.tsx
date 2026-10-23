'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowRight, WifiOff } from 'lucide-react';
import { useDataSourceStatus } from '@/hooks/use-data-source-status';

export function DataSourceAttentionBanner() {
  const { data, isLoading, error } = useDataSourceStatus();

  if (isLoading || error || !data) return null;

  const affected = data.sources.filter((source) => source.state === 'review' || source.state === 'offline');
  if (!affected.length) return null;

  const offline = affected.some((source) => source.state === 'offline');
  const reviewCount = affected.reduce((sum, source) => sum + Number(source.reviewCount || 0), 0);
  const Icon = offline ? WifiOff : AlertTriangle;

  return (
    <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3" aria-label="Atención de fuentes de datos">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium">
              {offline ? 'Hay una fuente sin conexión' : 'Hay datos que requieren revisión'}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {affected.map((source) => source.label).join(' · ')}
              {reviewCount > 0 ? ` · ${reviewCount} revisión${reviewCount === 1 ? '' : 'es'}` : ''}
            </p>
          </div>
        </div>
        <Link href="/dashboard/calidad-datos" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
          Revisar
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
