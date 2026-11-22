'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/dictionaries';

type ReviewCase = {
  number: string;
  id: string | null;
  kind: 'pilot_estimate' | 'safety_pause' | 'continuous_span' | 'unresolved';
  label: string;
  description: string;
  nextAction: string;
};

type Review = {
  assigned: boolean;
  state: 'needs_review' | 'no_cases_pending' | 'not_assigned' | 'no_references' | 'partial';
  items: ReviewCase[];
  totalCases: number;
  taskId?: string;
  taskTitle?: string;
  readOnly?: true;
};

async function fetcher(url: string): Promise<Review> {
  const res = await fetch(url, { cache: 'no-store', credentials: 'include' });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'No fue posible revisar los tiempos.');
  return data as Review;
}

/** A single existing review for Ariel, not one task per OT or any auto-correction. */
export function ArielOtHoursReview({ locale }: { locale: Locale }) {
  const english = locale === 'en';
  const { data, error, isLoading, mutate } = useSWR<Review>(
    '/api/maintenance/ot-hours-review',
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );
  if (isLoading || !data?.assigned) {
    if (!error) return null;
    return (
      <p className="text-xs text-muted-foreground">
        {english ? 'The time review is temporarily unavailable. Existing work orders are unaffected.'
          : 'La revisión de tiempos no está disponible por ahora. Las OT continúan normalmente.'}
      </p>
    );
  }
  if (data.state === 'no_references') return null;

  const primary = data.items.slice(0, 2);
  const remaining = data.items.slice(2);
  return (
    <section aria-label="N3uralia Intelligence · revisión de tiempos de OT" className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted-foreground">N3uralia Intelligence · Mantenimiento</p>
          <h2 className="mt-1 text-base font-semibold">
            {english ? 'Work-order time review' : 'Revisión de tiempos de OT'}
            {' · '}{data.totalCases}
          </h2>
          <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
            {english
              ? 'Source events were checked first. Planning validates only the remaining uncertain times; mechanics keep their ordinary workflow.'
              : 'Ya se contrastaron los eventos y estados de las OT. Ariel valida únicamente los tiempos que siguen sin evidencia suficiente. Los mecánicos mantienen su flujo habitual.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void mutate()}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          {english ? 'Refresh' : 'Actualizar'}
        </Button>
      </div>

      {data.state === 'partial' ? (
        <p role="status" className="text-xs text-muted-foreground">
          {english ? 'Source coverage is incomplete; no review conclusion is available.'
            : 'La evidencia está incompleta; no se presenta una conclusión de revisión.'}
        </p>
      ) : data.totalCases === 0 ? (
        <p className="text-xs text-muted-foreground">
          {english ? 'No remaining time anomalies were identified in the referenced orders.'
            : 'No se identifican tiempos pendientes en las OT referenciadas.'}
        </p>
      ) : (
        <>
          <div className="divide-y rounded-md border">
            {primary.map((item) => (
              <div className="flex flex-wrap items-start justify-between gap-2 p-3" key={item.number}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.number} · {item.label}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                  <p className="mt-1 text-xs">{item.nextAction}</p>
                </div>
                {item.id ? (
                  <Link className="inline-flex shrink-0 items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
                    href={'/dashboard/mantenimiento/ordenes-trabajo/' + item.id}>
                    {english ? 'View OT' : 'Ver OT'}<ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                ) : null}
              </div>
            ))}
          </div>
          {remaining.length > 0 ? (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                {english ? 'More work orders' : 'Otras OT para revisar'} · {remaining.length}
              </summary>
              <div className="mt-2 divide-y rounded-md border">
                {remaining.map((item) => (
                  <div className="flex flex-wrap justify-between gap-2 p-3" key={item.number}>
                    <div>
                      <p className="font-medium">{item.number} · {item.label}</p>
                      <p className="mt-1 text-muted-foreground">{item.description}</p>
                      <p className="mt-1">{item.nextAction}</p>
                    </div>
                    {item.id ? (
                      <Link href={'/dashboard/mantenimiento/ordenes-trabajo/' + item.id}
                        className="font-medium underline-offset-4 hover:underline">
                        {english ? 'View OT' : 'Ver OT'}
                      </Link>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {english ? 'No automatic updates to time, approvals or stock.'
            : 'No se corrigen automáticamente horas, aprobaciones ni existencias.'}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/acciones">
            {english ? 'Open assigned task' : 'Abrir tarea asignada'}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
