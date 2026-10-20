'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, Clock3, Gauge, Maximize2, RefreshCw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type ActionItem = {
  id: string;
  kind: string;
  title: string;
  description: string;
  evidence: string;
  href: string;
};

type ControlCenterResponse = {
  summary?: {
    openWorkOrders?: number;
    unassignedOpenWorkOrders?: number;
    unplannedOverdueHourSchedules?: number;
    operationallyBlocked?: number;
    pendingPlanSteps?: number;
    readyToClose?: number;
    pendingApprovals?: number;
    pendingMeterReviews?: number;
    recurringReliabilityAssets?: number;
    totalActions?: number;
  };
  actions?: ActionItem[];
};

const fetcher = async (url: string): Promise<ControlCenterResponse> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la torre de control');
  return payload;
};

const VIEWS = [
  { key: 'attention', title: 'Atención ahora', subtitle: 'Lo que requiere decisión o destrabe' },
  { key: 'orders', title: 'Órdenes en curso', subtitle: 'Trabajo activo y asignaciones pendientes' },
  { key: 'planning', title: 'Próximos trabajos', subtitle: 'Preventivos y trabajo por preparar' },
  { key: 'closure', title: 'Cierres', subtitle: 'OT listas o con pasos pendientes' },
  { key: 'meters', title: 'Horómetros', subtitle: 'Lecturas que requieren revisión' },
  { key: 'reliability', title: 'Repeticiones', subtitle: 'Señales que conviene revisar' },
] as const;

function actionMatches(view: string, action: ActionItem) {
  if (action.kind === 'operational_review') return false;
  if (view === 'attention') return ['operational_blocker','assignment_needed','approval_needed'].includes(action.kind);
  if (view === 'orders') return ['assignment_needed','plan_step','closure_evidence'].includes(action.kind);
  if (view === 'planning') return action.kind === 'preventive_overdue';
  if (view === 'closure') return ['ready_to_close','approval_needed','closure_evidence','plan_step'].includes(action.kind);
  if (view === 'meters') return action.kind === 'meter_review';
  if (view === 'reliability') return action.kind === 'reliability';
  return false;
}

export function MaintenanceControlTower() {
  const { data, error, isLoading, mutate } = useSWR<ControlCenterResponse>('/api/maintenance/control-center', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  const [viewIndex, setViewIndex] = useState(0);
  const [seconds, setSeconds] = useState(30);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          setViewIndex((index) => (index + 1) % VIEWS.length);
          return 30;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, []);

  const current = VIEWS[viewIndex];
  const actions = useMemo(() => (data?.actions || []).filter((action) => actionMatches(current.key, action)), [data?.actions, current.key]);
  const summary = data?.summary;

  const metrics = {
    attention: [
      ['Bloqueos', summary?.operationallyBlocked ?? '—'],
      ['Sin responsable', summary?.unassignedOpenWorkOrders ?? '—'],
      ['Por aprobar', summary?.pendingApprovals ?? '—'],
    ],
    orders: [
      ['OT abiertas', summary?.openWorkOrders ?? '—'],
      ['Sin responsable', summary?.unassignedOpenWorkOrders ?? '—'],
      ['Pasos pendientes', summary?.pendingPlanSteps ?? '—'],
    ],
    planning: [
      ['Preventivos pendientes', summary?.unplannedOverdueHourSchedules ?? '—'],
      ['OT abiertas', summary?.openWorkOrders ?? '—'],
      ['Bloqueos', summary?.operationallyBlocked ?? '—'],
    ],
    closure: [
      ['Listas para cerrar', summary?.readyToClose ?? '—'],
      ['Por aprobar', summary?.pendingApprovals ?? '—'],
      ['Pasos pendientes', summary?.pendingPlanSteps ?? '—'],
    ],
    meters: [
      ['Lecturas por revisar', summary?.pendingMeterReviews ?? '—'],
      ['Preventivos pendientes', summary?.unplannedOverdueHourSchedules ?? '—'],
      ['OT abiertas', summary?.openWorkOrders ?? '—'],
    ],
    reliability: [
      ['Repeticiones', summary?.recurringReliabilityAssets ?? '—'],
      ['Bloqueos', summary?.operationallyBlocked ?? '—'],
      ['OT abiertas', summary?.openWorkOrders ?? '—'],
    ],
  } as Record<string, Array<[string, string | number]>>;

  return <div className="min-h-[calc(100vh-7rem)] bg-background p-4 lg:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4 border-b pb-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Mantenimiento</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Torre de control</h1>
        <p className="mt-1 text-sm text-muted-foreground">Sólo información · cambia cada 30 segundos</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="outline">{viewIndex + 1} / {VIEWS.length}</Badge>
        <Badge variant="outline">Siguiente en {seconds}s</Badge>
        <Button variant="outline" size="sm" onClick={() => void mutate()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
        <Button variant="outline" size="icon" aria-label="Pantalla completa" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 className="h-4 w-4" /></Button>
      </div>
    </header>

    {error ? <div className="mt-8 rounded-lg border border-destructive/40 p-6 text-destructive">{error.message}</div> : null}
    {isLoading ? <div className="mt-8 grid gap-4 lg:grid-cols-3">{Array.from({length:6}).map((_,i)=><div key={i} className="h-36 animate-pulse rounded-lg bg-muted" />)}</div> : null}

    {!isLoading && !error ? <>
      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {(metrics[current.key] || []).map(([label, value]) => <div key={label} className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-4xl font-semibold tabular-nums">{value}</p>
        </div>)}
      </section>

      <section className="mt-6">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{current.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{current.subtitle}</p>
          </div>
          <div className="flex gap-1">
            {VIEWS.map((view, index) => <button key={view.key} type="button" aria-label={view.title} onClick={() => { setViewIndex(index); setSeconds(30); }} className={`h-2.5 w-8 rounded-full ${index === viewIndex ? 'bg-primary' : 'bg-muted'}`} />)}
          </div>
        </div>

        {actions.length === 0 ? <div className="flex min-h-[46vh] items-center justify-center rounded-xl border bg-card">
          <div className="text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-4 text-xl font-medium">Sin pendientes en esta vista</p><p className="mt-1 text-sm text-muted-foreground">No hay acciones que mostrar ahora.</p></div>
        </div> : <div className="grid gap-3">
          {actions.slice(0, 8).map((action, index) => <div key={action.id} className="grid gap-4 rounded-xl border bg-card p-5 lg:grid-cols-[52px_1fr_auto] lg:items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg border bg-muted/30">
              {action.kind === 'meter_review' ? <Gauge className="h-5 w-5" /> : action.kind === 'preventive_overdue' ? <Clock3 className="h-5 w-5" /> : action.kind === 'ready_to_close' ? <CheckCircle2 className="h-5 w-5" /> : action.kind === 'operational_blocker' ? <AlertTriangle className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">#{index + 1}</p>
              <p className="mt-1 text-lg font-semibold">{action.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{action.description}</p>
            </div>
            <p className="max-w-md text-sm text-muted-foreground lg:text-right">{action.evidence}</p>
          </div>)}
        </div>}
      </section>
    </> : null}
  </div>;
}
