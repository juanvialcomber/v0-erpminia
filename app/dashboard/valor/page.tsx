'use client';

import useSWR from 'swr';
import Link from 'next/link';

type Scorecard = {
  connectedData?: Record<string, number>;
  assistedDecision?: {
    matchReviews?: number;
    supplyDecisions?: number;
    supplyActions?: number;
    matchAcceptanceRate?: number | null;
    averageMatchReviewSeconds?: number | null;
  };
  outcomes?: {
    closed?: number;
    positive?: number;
    positiveRate?: number | null;
    falsePositives?: number;
    averageRiskReduction?: number | null;
    averageTimeToOutcomeHours?: number | null;
  };
  observedImpact?: {
    records?: number;
    e3Records?: number;
    observedMinutes?: number;
    observedValueClp?: number;
    accountingTruth?: boolean;
    auditedSavings?: boolean;
  };
  evidenceLevel?: string;
  workflowLevel?: number;
  adoptionGate?: Record<string, string>;
  scaleGate?: string;
};

type ApiResponse = {
  current?: Scorecard | null;
  financeReview?: {
    total?: number;
    reviewed?: number;
    deferred?: number;
    rejected?: number;
    latestAt?: string | null;
    calibrationGate?: string;
  } | null;
  history?: { count?: number; series?: Array<Record<string, unknown>> } | null;
};

const fetcher = async (url: string): Promise<ApiResponse> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el scorecard');
  return payload;
};

const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('es-CL').format(value)
    : '—';

const money = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value)
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value)
    : '—';

export default function ValueScorecardPage() {
  const { data, error, isLoading } = useSWR<ApiResponse>('/api/value/scorecard', fetcher, {
    refreshInterval: 15 * 60 * 1000,
  });

  const score = data?.current || {};
  const decisions = (score.assistedDecision?.matchReviews || 0) + (score.assistedDecision?.supplyDecisions || 0);
  const outcomes = score.outcomes?.closed || 0;
  const financeReview = data?.financeReview || {};
  const financeReviewTotal = financeReview.total || 0;
  const e3 = score.observedImpact?.e3Records || 0;
  const gates = score.adoptionGate || {};
  const scaleLabel =
    score.scaleGate === 'SCALE'
      ? 'Listo para escalar'
      : score.scaleGate === 'CONDITIONAL'
        ? 'En validación'
        : score.scaleGate || '—';
  const historyCount = data?.history?.count || 0;

  const nextActions = [
    decisions + financeReviewTotal < 20 ? `Registrar ${20 - decisions - financeReviewTotal} decisiones humanas más para calibrar L4.` : null,
    outcomes < 5 ? `Cerrar ${5 - outcomes} resultados reales para demostrar efecto operacional.` : null,
    e3 < 3 ? `Documentar ${3 - e3} impactos E3 con evidencia económica observada.` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-6">
      <section className="border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Valor MOTIL</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Valor demostrado</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Mide madurez operacional y evidencia económica sin confundir volumen procesado con ahorro realizado.
        </p>
      </section>

      {error ? <div className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">{error.message}</div> : null}

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Nivel operacional', isLoading ? '—' : `L${score.workflowLevel || 0}`],
          ['Evidencia', isLoading ? '—' : score.evidenceLevel || 'E0'],
          ['Gate de escala', isLoading ? '—' : scaleLabel],
          ['Histórico', isLoading ? '—' : `${number(historyCount)} ${historyCount === 1 ? 'corte' : 'cortes'}`],
        ].map(([label, value]) => (
          <div key={label} className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="rounded-lg border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Decisiones asistidas</p>
          <p className="mt-2 text-3xl font-semibold">{number(decisions)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Revisiones humanas y decisiones de abastecimiento registradas con evidencia.
          </p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Revisiones financieras</p>
          <p className="mt-2 text-3xl font-semibold">{number(financeReviewTotal)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Prioridades Laudus revisadas por Finanzas con actor y timestamp. No equivalen a ahorro.
          </p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Resultados cerrados</p>
          <p className="mt-2 text-3xl font-semibold">{number(outcomes)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Casos donde MOTIL compara recomendación, acción y resultado observado.
          </p>
        </div>
        <div className="rounded-lg border p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Impacto E3 observado</p>
          <p className="mt-2 text-3xl font-semibold">{money(score.observedImpact?.observedValueClp || 0)}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Sólo evidencia observada. No se presenta exposición ni monto involucrado como ahorro.
          </p>
        </div>
      </section>

      <section className="rounded-lg border p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Qué falta para escalar</h2>
            <p className="text-sm text-muted-foreground">Los gates suben sólo con uso y resultados reales.</p>
          </div>
          <Link href="/dashboard/finanzas" className="text-sm font-medium text-primary hover:underline">Ir a Finanzas</Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            ['Calibración de decisiones', decisions + financeReviewTotal >= 20 ? 'PASS' : gates.matchCalibration || 'HOLD'],
            ['Resultados de abastecimiento', gates.supplyOutcomes || 'HOLD'],
            ['Evidencia de valor', gates.valueEvidence || 'HOLD'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md bg-muted/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 font-semibold">{value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {nextActions.length ? nextActions.map((item) => (
            <div key={item} className="rounded-md border px-4 py-3 text-sm">{item}</div>
          )) : (
            <div className="rounded-md border px-4 py-3 text-sm">Los gates mínimos de escala están cumplidos. Corresponde medir recurrencia para E4.</div>
          )}
        </div>
      </section>

      <section className="rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Cobertura conectada</h2>
        <div className="mt-4 grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['Proveedores', score.connectedData?.suppliers],
            ['Órdenes de compra', score.connectedData?.purchaseOrders],
            ['Facturas de compra', score.connectedData?.purchaseInvoices],
            ['Productos con riesgo', score.connectedData?.supplyRiskProducts],
            ['Señales altas', score.connectedData?.supplySignalsHigh],
            ['Señales medias', score.connectedData?.supplySignalsMedium],
          ].map(([label, value]) => (
            <div key={String(label)} className="bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-lg font-semibold">{number(value)}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Estas cifras demuestran cobertura E1. No se interpretan como ahorro ni ROI.
        </p>
      </section>
    </div>
  );
}
