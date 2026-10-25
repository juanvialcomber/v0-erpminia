'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CalendarDays, CheckCircle2, PackageSearch, RefreshCw, Wrench } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

type WeeklyDecision = {
  canonicalAssetId: string | null;
  assetCode: string | null;
  assetName: string | null;
  site: string | null;
  priority: string | null;
  recommendedAction: string | null;
  criticality: string | null;
  meterUnit: string | null;
  interval: number | null;
  currentReading: number | null;
  currentReadingAt: string | null;
  remainingMeter: number | null;
  sourcePartsStatus: string | null;
  actualMaterialShortage: boolean;
  evidenceFreshness: 'current' | 'stale' | 'unknown';
  readingAgeDays: number | null;
  sourceFile: string | null;
  sourceImportedAt: string | null;
  openWorkOrderCount: number;
  state: 'scheduled' | 'blocked_materials' | 'ready' | 'review' | 'stale_evidence';
  scheduledWorkOrder: {
    id: string;
    work_order_number: string | null;
    title: string | null;
    scheduled_date: string | null;
    assigned_to_name: string | null;
  } | null;
  standardPlan: {
    id: string;
    planCode: string;
    name: string;
    status: string;
    estimatedDurationHours: number | null;
    proposalSource: 'motil' | 'human';
  } | null;
};

type WeeklyResponse = {
  period: { from: string; until: string };
  weekPeriod: { from: string; until: string };
  weeklyDecisions: WeeklyDecision[];
  weeklySummary: {
    total: number;
    critical: number;
    scheduled: number;
    blockedMaterials: number;
    ready: number;
    review: number;
    staleEvidence: number;
  };
};

const fetcher = async (url: string): Promise<WeeklyResponse> => {
  const response = await apiFetch(url);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la planificación semanal.');
  return payload as WeeklyResponse;
};

function priorityVariant(priority: string | null) {
  if (priority?.startsWith('P1') || priority?.startsWith('P2')) return 'destructive' as const;
  return 'secondary' as const;
}

function stateLabel(row: WeeklyDecision) {
  if (row.state === 'scheduled') return 'Programada';
  if (row.state === 'blocked_materials') return 'Revisar materiales';
  if (row.state === 'ready') return 'Lista para programar';
  if (row.state === 'stale_evidence') return 'Actualizar evidencia';
  return row.standardPlan?.status === 'proposed' ? 'Plan MOTIL por aprobar' : 'Requiere revisión';
}

function readingText(row: WeeklyDecision) {
  if (row.currentReading == null || !row.meterUnit) return 'Sin lectura suficiente';
  const remaining = row.remainingMeter == null ? '' : ` · ${Math.abs(row.remainingMeter).toLocaleString('es-CL', { maximumFractionDigits: 1 })} ${row.meterUnit} ${row.remainingMeter < 0 ? 'sobre umbral' : 'restantes'}`;
  return `${row.currentReading.toLocaleString('es-CL', { maximumFractionDigits: 1 })} ${row.meterUnit}${remaining}`;
}

export function WeeklyMaintenancePlanning() {
  const { data, error, isLoading, mutate } = useSWR<WeeklyResponse>('/api/planning/maintenance', fetcher, { revalidateOnFocus: false });
  const rows = data?.weeklyDecisions || [];
  const summary = data?.weeklySummary;
  const sessionIdRef = useRef<string>(typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `weekly-${Date.now()}`);
  const sessionStartedAtRef = useRef<number>(Date.now());
  const sessionRecordedRef = useRef(false);

  useEffect(() => {
    if (!data?.weekPeriod || !summary || sessionRecordedRef.current) return;
    sessionRecordedRef.current = true;
    void apiFetch('/api/planning/maintenance/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'session_started',
        sessionId: sessionIdRef.current,
        weekFrom: data.weekPeriod.from,
        weekUntil: data.weekPeriod.until,
        summary,
      }),
    }).catch(() => undefined);
  }, [data?.weekPeriod, summary]);

  function recordDecision(row: WeeklyDecision, decisionAction: 'open_work_order' | 'review_plan' | 'schedule' | 'refresh_reading') {
    if (!data?.weekPeriod) return;
    void apiFetch('/api/planning/maintenance/evidence', {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'decision_opened',
        sessionId: sessionIdRef.current,
        weekFrom: data.weekPeriod.from,
        weekUntil: data.weekPeriod.until,
        decisionAction,
        latencyMs: Date.now() - sessionStartedAtRef.current,
        assetId: row.canonicalAssetId,
        assetCode: row.assetCode,
        priority: row.priority,
        planningState: row.state,
        evidenceFreshness: row.evidenceFreshness,
        proposedByMotil: row.standardPlan?.proposalSource === 'motil',
      }),
    }).catch(() => undefined);
  }

  return <main className="space-y-6">
    <header className="flex flex-col gap-4 border-b pb-5 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mantenimiento · Ariel</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Planificación semanal</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          MOTIL prepara las decisiones de mayor prioridad para los próximos 7 días. Ariel valida qué se programa, qué se corrige y qué queda bloqueado.
        </p>
        {data?.weekPeriod ? <p className="mt-1 text-xs text-muted-foreground">Semana operativa: {new Date(data.weekPeriod.from + 'T12:00:00').toLocaleDateString('es-CL')}–{new Date(data.weekPeriod.until + 'T12:00:00').toLocaleDateString('es-CL')}</p> : null}
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className="mr-2 h-4 w-4"/>Actualizar</Button>
        <Button asChild><Link href="/dashboard/mantenimiento/planes-estandar"><Wrench className="mr-2 h-4 w-4"/>Planes estándar</Link></Button>
      </div>
    </header>

    {error ? <StatePanel tone="error" title="Planificación semanal no disponible" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} className="min-h-0" /> : null}

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Decisiones', summary?.total],
        ['Críticas', summary?.critical],
        ['Programadas', summary?.scheduled],
        ['Bloqueadas por materiales', summary?.blockedMaterials],
      ].map(([label, value]) => <Card key={String(label)} className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{isLoading || value == null ? '—' : Number(value).toLocaleString('es-CL')}</p></CardContent></Card>)}
    </section>

    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Qué debe decidir Ariel</h2>
        <p className="text-sm text-muted-foreground">Ordenado por prioridad operacional. La evidencia de horómetro y planificación se muestra con su fuente; no reemplaza el juicio del supervisor.</p>
      </div>

      {isLoading ? <div className="h-48 animate-pulse rounded-lg bg-muted"/> : !error && rows.length === 0 ? <Card className="border-dashed shadow-none"><CardContent className="p-10 text-center text-sm text-muted-foreground">No hay decisiones semanales priorizadas con la evidencia disponible.</CardContent></Card> : <div className="space-y-3">
        {rows.map((row, index) => <Card key={row.canonicalAssetId || row.assetCode || row.assetName || String(index)} className="shadow-none">
          <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px_190px] lg:items-center">
            <div>
              <div className="flex flex-wrap gap-2">
                <Badge variant={priorityVariant(row.priority)}>{row.priority || 'Sin prioridad'}</Badge>
                <Badge variant="outline">{stateLabel(row)}</Badge>
                {row.standardPlan?.proposalSource === 'motil' && <Badge variant="outline">Propuesto por MOTIL</Badge>}
              </div>
              <p className="mt-3 font-medium">{row.assetCode || row.assetName || 'Equipo sin nombre'}</p>
              <p className="mt-1 text-sm text-muted-foreground">{row.site || 'Ubicación no disponible'} · Criticidad {row.criticality || 'sin dato'}</p>
              <p className="mt-2 text-sm">{row.recommendedAction || 'Revisar planificación y evidencia.'}</p>
              <p className="mt-2 text-xs text-muted-foreground">{readingText(row)}{row.currentReadingAt ? ` · lectura ${new Date(row.currentReadingAt).toLocaleDateString('es-CL')}` : ''}</p>
              {row.standardPlan ? <p className="mt-1 text-xs text-muted-foreground">Plan: {row.standardPlan.name}{row.standardPlan.estimatedDurationHours != null ? ` · ${row.standardPlan.estimatedDurationHours.toLocaleString('es-CL')} h observadas/estimadas` : ''}</p> : null}
              <p className="mt-1 text-xs text-muted-foreground">Fuente: {row.sourceFile || 'planificación canónica'}{row.sourcePartsStatus ? ` · estado materiales en fuente: ${row.sourcePartsStatus}` : ''}</p>
              {row.evidenceFreshness === 'stale' ? <p className="mt-1 text-xs text-amber-600">Lectura con {row.readingAgeDays ?? '—'} días de antigüedad. MOTIL exige actualización antes de tratar esta señal como decisión semanal.</p> : null}
            </div>

            <div className="space-y-2 text-sm">
              {row.scheduledWorkOrder ? <>
                <p className="text-xs text-muted-foreground">Programación</p>
                <p>{row.scheduledWorkOrder.scheduled_date || 'Sin fecha'} · {row.scheduledWorkOrder.assigned_to_name || 'Sin responsable'}</p>
                <p className="text-xs text-muted-foreground">{row.scheduledWorkOrder.work_order_number || 'OT'} · {row.scheduledWorkOrder.title || 'Sin título'}</p>
              </> : row.actualMaterialShortage ? <>
                <p className="flex items-center gap-2 font-medium"><PackageSearch className="h-4 w-4"/>Faltante real en OT</p>
                <p className="text-xs text-muted-foreground">Existe cantidad faltante registrada en requerimientos actuales de la OT.</p>
              </> : row.state === 'stale_evidence' ? <>
                <p className="flex items-center gap-2 font-medium"><RefreshCw className="h-4 w-4"/>Actualizar lectura</p>
                <p className="text-xs text-muted-foreground">La prioridad proviene de evidencia antigua y debe validarse antes de programar.</p>
              </> : row.standardPlan?.status === 'approved' ? <>
                <p className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-4 w-4"/>Preparada</p>
                <p className="text-xs text-muted-foreground">Tiene plan estándar aprobado y no registra bloqueo de materiales.</p>
              </> : <>
                <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4"/>Requiere revisión</p>
                <p className="text-xs text-muted-foreground">MOTIL no la presenta como lista sin evidencia suficiente.</p>
              </>}
            </div>

            <div className="flex justify-end">
              {row.scheduledWorkOrder ? <Button asChild size="sm"><Link href={`/dashboard/mantenimiento/ordenes-trabajo/${row.scheduledWorkOrder.id}`} onClick={() => recordDecision(row, 'open_work_order')}><CalendarDays className="mr-2 h-4 w-4"/>Abrir OT</Link></Button>
                : row.state === 'stale_evidence' ? <Button asChild size="sm" variant="outline"><Link href={`/dashboard/mantenimiento/horometros?asset=${encodeURIComponent(row.canonicalAssetId || '')}`} onClick={() => recordDecision(row, 'refresh_reading')}><RefreshCw className="mr-2 h-4 w-4"/>Actualizar lectura</Link></Button>
                : row.standardPlan?.status === 'proposed' ? <Button asChild size="sm"><Link href="/dashboard/mantenimiento/planes-estandar" onClick={() => recordDecision(row, 'review_plan')}><Wrench className="mr-2 h-4 w-4"/>Revisar plan</Link></Button>
                : <Button asChild size="sm"><Link href={{
                    pathname: '/dashboard/mantenimiento/ordenes-trabajo/create',
                    query: {
                      assetId: row.canonicalAssetId || '',
                      title: row.interval ? `Mantención ${row.interval} ${row.meterUnit || 'h'}` : 'Mantención preventiva',
                      workType: 'preventive',
                      priority: row.priority?.startsWith('P1') || row.priority?.startsWith('P2') ? 'high' : 'medium',
                      standardPlanId: row.standardPlan?.status === 'approved' ? row.standardPlan.id : '',
                      standardPlanName: row.standardPlan?.status === 'approved' ? row.standardPlan.name : '',
                      plannedDurationHours: row.standardPlan?.status === 'approved' && row.standardPlan.estimatedDurationHours != null
                        ? String(row.standardPlan.estimatedDurationHours)
                        : '',
                    },
                  }} onClick={() => recordDecision(row, 'schedule')}><CalendarDays className="mr-2 h-4 w-4"/>Programar</Link></Button>}
            </div>
          </CardContent>
        </Card>)}
      </div>}
    </section>

    <Card className="shadow-none">
      <CardHeader><CardTitle className="text-base">Después de esta semana</CardTitle></CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p>Los preventivos, horómetros y señales de más largo plazo siguen disponibles como evidencia; esta vista sólo concentra decisiones semanales.</p>
        <Button variant="outline" asChild><Link href="/dashboard/mantenimiento/preventivo-horas">Ver preventivos y horómetros</Link></Button>
      </CardContent>
    </Card>
  </main>;
}
