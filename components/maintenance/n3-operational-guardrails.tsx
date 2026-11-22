'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/dictionaries';

type Signal = {
  key: string;
  severity: 'P1' | 'P2' | 'P3';
  title: string;
  explanation: string;
  nextAction: string;
  href: string;
};
type Result = {
  status: 'needs_action' | 'review' | 'no_issues_observed' | 'partial';
  findings: Signal[];
  totalSignals: number;
  truncated: boolean;
  coverage: { workOrdersReviewed: number; workOrdersTotal: number | null; complete: boolean; stockSourceChecked: boolean; coreErrorsChecked: boolean };
  generatedAt: string;
  cadence: 'on_dashboard_open_and_refresh';
};

async function readGuardrails(url: string): Promise<Result> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'No fue posible completar los controles preventivos.');
  return body as Result;
}

/**
 * Passive signal strip for leaders only: the primary daily decision always
 * remains above. A detector doesn't create a task, change stock or close an OT.
 */
export function N3OperationalGuardrails({ locale }: { locale: Locale }) {
  const english = locale === 'en';
  const { data, error, isLoading, mutate } = useSWR<Result>(
    '/api/intelligence/maintenance-guardrails',
    readGuardrails,
    { revalidateOnFocus: false, shouldRetryOnError: false, refreshInterval: 600_000 },
  );
  if (isLoading) return null;

  if (error) return (
    <section aria-label="N3uralia Intelligence" className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-xs text-muted-foreground">
      <span>{english ? 'Preventive check unavailable; daily work is unaffected.' : 'La revisión preventiva no está disponible; el trabajo diario continúa normalmente.'}</span>
      <Button size="sm" variant="ghost" onClick={() => void mutate()}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />{english ? 'Retry' : 'Reintentar'}
      </Button>
    </section>
  );
  if (!data) return null;

  const urgent = data.findings.filter((signal) => signal.severity === 'P1');
  const secondary = data.findings.filter((signal) => signal.severity !== 'P1');
  const first = urgent[0];

  return (
    <section aria-label="N3uralia Intelligence · Controles preventivos" className="space-y-3 border-b py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          <span className="font-medium text-foreground">N3uralia Intelligence</span>
          <span>{english ? 'Preventive checks' : 'Controles preventivos'}</span>
        </div>
        <span>
          {data.coverage.workOrdersReviewed.toLocaleString(english ? 'en-US' : 'es-CL')} {english ? 'work orders inspected' : 'OT revisadas'}
          {!data.coverage.complete ? (english ? ' · partial' : ' · parcial') : ''}
        </span>
      </div>

      {first ? (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold">{first.title}</p>
              <p className="text-xs text-muted-foreground">{first.explanation}</p>
              <p className="text-xs">{first.nextAction}</p>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={first.href}>{english ? 'Review' : 'Revisar'}<ArrowRight className="ml-1.5 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {data.totalSignals > 0
            ? (english ? 'No critical anomalies found. Other observations are available below.' : 'Sin anomalías críticas. Hay observaciones secundarias para revisar.')
            : (english ? 'No anomalies observed in the checked scope.' : 'Sin inconsistencias observadas en el alcance revisado.')}
        </p>
      )}

      {data.findings.length > 1 || secondary.length > 0 || data.truncated ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer select-none font-medium">
            {english ? 'Other observations and evidence' : 'Otras observaciones y evidencia'}
            {' · '}{Math.max(0, data.totalSignals - (first ? 1 : 0)).toLocaleString(english ? 'en-US' : 'es-CL')}
          </summary>
          <div className="mt-2 divide-y rounded-md border">
            {data.findings.filter((row) => row.key !== first?.key).map((row) => (
              <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{row.title}</p>
                  <p>{row.nextAction}</p>
                </div>
                <Link href={row.href} className="font-medium text-foreground underline-offset-4 hover:underline">
                  {english ? 'Review' : 'Revisar'}
                </Link>
              </div>
            ))}
            {data.truncated ? <p className="p-3">{english ? 'Additional signals exist; showing a bounded sample.' : 'Hay más observaciones; se muestra una muestra acotada.'}</p> : null}
          </div>
        </details>
      ) : null}
    </section>
  );
}
