'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Activity, AlertTriangle, ArrowRight, CalendarDays, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';
import { cn } from '@/lib/utils';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar disponibilidad');
  return payload;
};

type PeriodKey = '7d' | '30d' | 'month';

type ReportedAggregate = {
  sourceRows: number;
  expectedObservations: number;
  classifiedObservations: number;
  availableObservations: number;
  unavailableObservations: number;
  reviewRequired: number;
  unresolvedReportedRows: number;
  availabilityPercentage: number | null;
  evidenceCoveragePercentage: number | null;
};

type ReportedAvailabilityResponse = {
  status: 'ready' | 'no_data' | 'schema_pending';
  mine: string;
  range: { from: string; to: string; period: string };
  filters?: {
    families?: string[];
  };
  summary: (ReportedAggregate & {
    reportDays: number;
    latestReportedDate: string | null;
    currentUnavailable: number;
  }) | null;
  daily?: Array<ReportedAggregate & { date: string }>;
  families?: Array<ReportedAggregate & {
    family: string;
    familySource: 'canonical' | 'mixed_or_derived';
  }>;
  assets?: Array<ReportedAggregate & {
    id: string;
    assetCode?: string | null;
    assetName: string;
    family: string;
    familySource: string;
    latestDate: string;
    latestStatus: string;
    latestClassification: string;
    latestDetail?: string | null;
    sourceFile: string;
  }>;
  currentUnavailable?: Array<{
    canonicalAssetId?: string | null;
    assetName: string;
    family: string;
    status: string;
    detail?: string | null;
    sourceFile: string;
    reportedDate: string;
  }>;
  evidence?: {
    methodology?: string;
    numerator?: string;
    denominator?: string;
    standbyRule?: string;
    coverageRule?: string;
    timedAvailability?: string;
    familyRule?: string;
    note?: string;
  };
  timestamp: string;
};

function pct(value: number | null | undefined) {
  return value == null ? '—' : `${value.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function shortDate(value: string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short' }).format(new Date(`${value}T12:00:00Z`));
}

function metricTone(value: number | null | undefined) {
  return value == null ? 'text-muted-foreground' : 'text-foreground';
}

export function AvailabilitySemaphore() {
  const [period, setPeriod] = useState<PeriodKey>('30d');
  const [family, setFamily] = useState('Todas');
  const query = new URLSearchParams({ mine: 'Don Jaime', period });
  if (family !== 'Todas') query.set('family', family);

  const { data, error, isLoading, mutate } = useSWR<ReportedAvailabilityResponse>(
    `/api/maintenance/availability/reported?${query.toString()}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const { data: unfiltered } = useSWR<ReportedAvailabilityResponse>(
    `/api/maintenance/availability/reported?mine=Don+Jaime&period=${period}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  const families = useMemo(
    () => ['Todas', ...((unfiltered?.filters?.families || []).filter(Boolean))],
    [unfiltered?.filters?.families],
  );

  if (isLoading) {
    return (
      <StatePanel
        tone="loading"
        title="Calculando disponibilidad reportada"
        description="Reuniendo snapshots diarios, activos reconciliados y cobertura de evidencia de Mina Don Jaime."
      />
    );
  }

  if (error) {
    return (
      <StatePanel
        tone="error"
        title="No fue posible cargar disponibilidad"
        description={error instanceof Error ? error.message : 'Reintenta la consulta.'}
        actions={<Button variant="outline" onClick={() => void mutate()}><RefreshCw className="h-4 w-4" />Reintentar</Button>}
      />
    );
  }

  if (!data || data.status === 'schema_pending') {
    return (
      <StatePanel
        tone="empty"
        title="Modelo V1 listo para activar"
        description="La vista de disponibilidad reportada está preparada, pero la migración y la carga histórica todavía no están aplicadas en este entorno. No se publica ningún porcentaje mientras falte esa base."
      />
    );
  }

  if (data.status === 'no_data' || !data.summary) {
    return (
      <StatePanel
        tone="empty"
        title="Sin snapshots diarios en el período"
        description="No hay evidencia diaria clasificada para Mina Don Jaime en este rango. La ausencia de registros no se interpreta como 0% de disponibilidad."
      />
    );
  }

  const s = data.summary;
  const worstAssets = (data.assets || [])
    .filter((asset) => asset.classifiedObservations > 0)
    .slice(0, 12);

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader className="gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Mina Don Jaime</Badge>
              <Badge variant="secondary">V1 · snapshot diario</Badge>
              {family !== 'Todas' ? <Badge variant="outline">{family}</Badge> : null}
            </div>
            <CardTitle className="text-xl">Disponibilidad reportada</CardTitle>
            <p className="max-w-3xl text-sm text-muted-foreground">
              Porcentaje derivado exclusivamente de estados diarios clasificables. No reemplaza disponibilidad técnica horaria ni utiliza minutos inventados.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex rounded-md border p-1" aria-label="Período">
              {([
                ['7d', '7 días'],
                ['30d', '30 días'],
                ['month', 'Mes'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPeriod(value)}
                  className={cn(
                    'min-h-9 rounded px-3 text-xs font-medium transition-colors',
                    period === value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <label className="sr-only" htmlFor="availability-family">Familia</label>
            <select
              id="availability-family"
              value={family}
              onChange={(event) => setFamily(event.target.value)}
              className="min-h-11 rounded-md border bg-background px-3 text-sm"
            >
              {families.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-card p-4">
              <p className="text-xs text-muted-foreground">Disponibilidad reportada</p>
              <p className={cn('mt-2 text-3xl font-semibold', metricTone(s.availabilityPercentage))}>{pct(s.availabilityPercentage)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.availableObservations}/{s.classifiedObservations} observaciones disponibles</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-xs text-muted-foreground">Cobertura de evidencia</p>
              <p className={cn('mt-2 text-3xl font-semibold', metricTone(s.evidenceCoveragePercentage))}>{pct(s.evidenceCoveragePercentage)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.classifiedObservations}/{s.expectedObservations} observaciones esperadas</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-xs text-muted-foreground">Indisponibles al último corte</p>
              <p className="mt-2 text-3xl font-semibold">{s.currentUnavailable}</p>
              <p className="mt-1 text-xs text-muted-foreground">Corte {shortDate(s.latestReportedDate)}</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-xs text-muted-foreground">Días con reporte</p>
              <p className="mt-2 text-3xl font-semibold">{s.reportDays}</p>
              <p className="mt-1 text-xs text-muted-foreground">{s.reviewRequired} observaciones requieren revisión</p>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 text-sm text-muted-foreground">
            <strong className="font-medium text-foreground">Regla:</strong> {data.evidence?.denominator} {data.evidence?.standbyRule}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" />Tendencia diaria</CardTitle>
            <p className="text-sm text-muted-foreground">Cada punto se recalcula desde numerador y denominador del día; no promedia porcentajes.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.daily || []).length ? (data.daily || []).map((day) => (
              <div key={day.date} className="grid grid-cols-[76px_1fr_70px_70px] items-center gap-3 rounded-md border px-3 py-2">
                <span className="text-xs font-medium">{shortDate(day.date)}</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.max(0, Math.min(100, day.availabilityPercentage || 0))}%` }}
                  />
                </div>
                <span className={cn('text-right text-sm font-semibold', metricTone(day.availabilityPercentage))}>{pct(day.availabilityPercentage)}</span>
                <span className={cn('text-right text-xs', metricTone(day.evidenceCoveragePercentage))}>{pct(day.evidenceCoveragePercentage)}</span>
              </div>
            )) : <p className="text-sm text-muted-foreground">Sin días clasificables en este período.</p>}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4" />Familias</CardTitle>
            <p className="text-sm text-muted-foreground">Agregación por días-equipo. Las familias derivadas se identifican y no reemplazan el maestro canónico.</p>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data.families || []).map((item) => (
              <div key={item.family} className="grid grid-cols-[1fr_90px_90px] items-center gap-3 rounded-md border px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.family}</p>
                  <p className="text-xs text-muted-foreground">{item.familySource === 'canonical' ? 'Familia canónica' : 'Familia parcial/derivada'}</p>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-semibold', metricTone(item.availabilityPercentage))}>{pct(item.availabilityPercentage)}</p>
                  <p className="text-[11px] text-muted-foreground">disp.</p>
                </div>
                <div className="text-right">
                  <p className={cn('text-sm font-semibold', metricTone(item.evidenceCoveragePercentage))}>{pct(item.evidenceCoveragePercentage)}</p>
                  <p className="text-[11px] text-muted-foreground">cobertura</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {(data.currentUnavailable || []).length > 0 ? (
        <Card className="border-destructive/30 shadow-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="h-4 w-4 text-destructive" />Indisponibles al último reporte</CardTitle>
            <p className="text-sm text-muted-foreground">Sólo estados explícitamente clasificados como indisponibles en la evidencia del último corte.</p>
          </CardHeader>
          <CardContent className="divide-y rounded-lg border">
            {(data.currentUnavailable || []).map((item, index) => (
              <div key={`${item.canonicalAssetId || item.assetName}-${index}`} className="grid gap-2 py-3 first:pt-0 last:pb-0 md:grid-cols-[1.2fr_.7fr_.8fr_1.5fr] md:items-center">
                <div>
                  <p className="font-medium">{item.assetName}</p>
                  <p className="text-xs text-muted-foreground">{item.family}</p>
                </div>
                <Badge variant="destructive" className="w-fit">{item.status}</Badge>
                <span className="text-xs text-muted-foreground">{shortDate(item.reportedDate)}</span>
                <span className="text-sm text-muted-foreground">{item.detail || 'Sin diagnóstico informado'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Activity className="h-4 w-4" />Disponibilidad por máquina</CardTitle>
          <p className="text-sm text-muted-foreground">Ordenada desde menor disponibilidad. El porcentaje se calcula sobre observaciones clasificables del equipo.</p>
        </CardHeader>
        <CardContent>
          {worstAssets.length ? (
            <div className="divide-y rounded-lg border">
              {worstAssets.map((asset) => (
                <div key={asset.id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.5fr)_130px_120px_130px_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{asset.assetName}</p>
                    <p className="truncate text-xs text-muted-foreground">{asset.family} · último estado: {asset.latestStatus}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Disponibilidad</p>
                    <p className={cn('font-semibold', metricTone(asset.availabilityPercentage))}>{pct(asset.availabilityPercentage)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Cobertura</p>
                    <p className={cn('font-semibold', metricTone(asset.evidenceCoveragePercentage))}>{pct(asset.evidenceCoveragePercentage)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Observaciones</p>
                    <p className="font-medium">{asset.classifiedObservations}/{asset.sourceRows}</p>
                  </div>
                  {asset.id.startsWith('unresolved:') ? (
                    <Badge variant="outline">Por conciliar</Badge>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/dashboard/mantenimiento/equipos/${encodeURIComponent(asset.id)}/ficha`}>
                        Ficha 360<ArrowRight className="h-4 w-4" />
                      </Link>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">No hay máquinas con denominador válido en este período.</div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" />Método: snapshot diario reportado · fuente trazable · sin minutos inferidos</span>
        <span>Actualizado: {new Date(data.timestamp).toLocaleString('es-CL')}</span>
      </div>
    </div>
  );
}
