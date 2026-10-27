'use client';

import useSWR from 'swr';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

type Coverage = { numerator: number; denominator: number; rate: number | null };
type ValueLedger = {
  observed: {
    workOrders: number;
    completed: number;
    emergency: number;
    assignmentCoverage: Coverage;
    assetCoverage: Coverage;
    timerCoverage: Coverage;
    rootCauseCoverage: Coverage;
    preventiveActionCoverage: Coverage;
    meterCoverage: Coverage;
    avgCreateToCloseHours: number | null;
    avgTimerMinutesWhenUsed: number | null;
  };
  evidence: {
    level: string;
    baselineStatus: string;
    attribution: string;
    note: string;
  };
  value: {
    level: string;
    vLevel: string;
    pricingReadiness: string;
    nextMeasurement: string;
  };
};

const fetcher = async (url: string): Promise<ValueLedger> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'request failed');
  return payload as ValueLedger;
};

function pct(value: Coverage) {
  if (value.rate == null) return '—';
  return `${Math.round(value.rate * 100)}%`;
}

export function MaintenanceValueLedger() {
  const { data, error, isLoading } = useSWR<ValueLedger>(
    '/api/maintenance/value-ledger?days=30',
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) return <StatePanel tone="loading" title="Calculando evidencia de valor..." className="min-h-32" />;
  if (error || !data) return <StatePanel tone="error" title="No se pudo calcular el valor observado" description={error?.message} className="min-h-32" />;

  const o = data.observed;
  const metrics = [
    ['OT observadas', o.workOrders, 'Volumen real del período'],
    ['Asignación', pct(o.assignmentCoverage), `${o.assignmentCoverage.numerator}/${o.assignmentCoverage.denominator} con responsable`],
    ['Cronómetro', pct(o.timerCoverage), `${o.timerCoverage.numerator}/${o.timerCoverage.denominator} con tiempo registrado`],
    ['Causa raíz', pct(o.rootCauseCoverage), `${o.rootCauseCoverage.numerator}/${o.rootCauseCoverage.denominator} con evidencia`],
  ] as const;

  return <Card className="shadow-none">
    <CardHeader>
      <CardTitle className="text-lg">Valor operacional observado</CardTitle>
      <CardDescription>30 días · sólo evidencia canónica. No se calcula ROI sin baseline comparable.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([label, value, detail]) => <div key={label} className="rounded-md border px-3 py-3">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </div>)}
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-3">
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Evidencia</p>
          <p className="mt-1 font-medium">{data.evidence.level} · {data.evidence.attribution}</p>
          <p className="mt-1 text-xs text-muted-foreground">{data.evidence.note}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Madurez de valor</p>
          <p className="mt-1 font-medium">{data.value.level} · {data.value.vLevel}</p>
          <p className="mt-1 text-xs text-muted-foreground">Pricing: {data.value.pricingReadiness}</p>
        </div>
        <div className="rounded-md border p-3">
          <p className="text-xs text-muted-foreground">Siguiente medición</p>
          <p className="mt-1 font-medium">{data.value.nextMeasurement}</p>
          <p className="mt-1 text-xs text-muted-foreground">Ésta es la variable que permite avanzar hacia E3/V5.</p>
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer select-none font-medium">Ver cobertura de evidencia</summary>
        <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
          <p>Equipo asociado: {pct(o.assetCoverage)} ({o.assetCoverage.numerator}/{o.assetCoverage.denominator})</p>
          <p>Acción preventiva: {pct(o.preventiveActionCoverage)} ({o.preventiveActionCoverage.numerator}/{o.preventiveActionCoverage.denominator})</p>
          <p>Horómetro: {pct(o.meterCoverage)} ({o.meterCoverage.numerator}/{o.meterCoverage.denominator})</p>
          <p>OT cerradas: {o.completed}/{o.workOrders}</p>
          <p>Tiempo medio creación→cierre: {o.avgCreateToCloseHours == null ? '—' : `${o.avgCreateToCloseHours} h`}</p>
          <p>Tiempo medio cronometrado: {o.avgTimerMinutesWhenUsed == null ? '—' : `${o.avgTimerMinutesWhenUsed} min`}</p>
        </div>
      </details>
    </CardContent>
  </Card>;
}
