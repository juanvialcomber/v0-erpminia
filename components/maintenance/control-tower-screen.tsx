'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import useSWR from 'swr';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Clock3,
  Gauge,
  Monitor,
  Radio,
  ShieldAlert,
  TimerReset,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';
import { cn } from '@/lib/utils';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la Torre de Control');
  return payload;
};

const slides = [
  { key: 'analysis', label: 'Análisis operacional', question: '¿Qué requiere atención ahora?', icon: Activity },
  { key: 'stopped', label: 'Equipos detenidos', question: '¿Qué equipos están detenidos y qué los bloquea?', icon: ShieldAlert },
  { key: 'preventive', label: 'Mantenciones preventivas', question: '¿Qué mantenciones están vencidas o próximas?', icon: TimerReset },
  { key: 'schedule', label: 'Programación de trabajos', question: '¿Qué trabajo está atrasado o debe ejecutarse ahora?', icon: CalendarDays },
  { key: 'fleet', label: 'Control general de flota', question: '¿Dónde está concentrada la atención de la flota?', icon: Gauge },
  { key: 'management', label: 'Indicadores de gestión', question: '¿Cómo está respondiendo el área de mantenimiento?', icon: BarChart3 },
] as const;

const number = (value: unknown, digits = 1) => {
  if (value === null || value === undefined || value === '') return '—';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return '—';
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: digits }).format(parsed);
};

const SANTIAGO_TIME_ZONE = 'America/Santiago';

const dateTime = (value: unknown) => {
  if (!value) return 'Sin actualización';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return 'Sin actualización';
  return parsed.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: SANTIAGO_TIME_ZONE });
};

const shortDate = (value: unknown) => {
  if (!value) return '—';
  const text = String(value).slice(0, 10);
  const parsed = new Date(`${text}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', timeZone: SANTIAGO_TIME_ZONE });
};

const ageLabel = (hours: unknown) => {
  const value = Number(hours);
  if (!Number.isFinite(value)) return 'sin fecha';
  if (value < 1) return 'ahora';
  if (value < 24) return `hace ${value} h`;
  return `hace ${Math.floor(value / 24)} d`;
};

const statusLabel = (value: unknown) => {
  const status = String(value || '').toLowerCase();
  if (status === 'completed' || status === 'closed') return 'Terminada';
  if (status === 'in_progress' || status === 'in-progress') return 'En ejecución';
  if (status === 'paused') return 'Pausada';
  if (status === 'open' || status === 'assigned' || status === 'pending' || status === 'planned') return 'Pendiente';
  return value ? String(value) : 'Sin estado';
};

const sourceLabel = (source: unknown) => {
  if (source === 'email') return 'Correo';
  if (source === 'whatsapp') return 'WhatsApp';
  if (source === 'canonical_status') return 'Estado validado';
  if (source === 'work_order') return 'OT';
  if (source === 'planning_master') return 'Planificación';
  return 'Maestro';
};

const signalText = (row: any) => {
  if (row.latestSignalSource === 'email') return row.emailIssue || row.emailWork || row.emailReportedStatus || 'Actualización por correo';
  if (row.latestSignalSource === 'whatsapp') return row.whatsappDescription || 'Actualización por WhatsApp';
  if (row.latestSignalSource === 'work_order') return row.openWorkOrderNumbers?.length ? `OT abiertas: ${row.openWorkOrderNumbers.join(', ')}` : 'Actualización de OT';
  return row.canonicalStatusReason || row.recommendedAction || row.planningObservations || row.currentReportedStatus || 'Sin novedad operacional reciente';
};

export default function MaintenanceControlTowerPage() {
  const { data, error, isLoading } = useSWR('/api/maintenance/control-tower', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const [slideIndex, setSlideIndex] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [secondsToNext, setSecondsToNext] = useState(30);
  const rotationMs = 30_000;

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduceMotion(media.matches);
    sync();
    media.addEventListener?.('change', sync);
    return () => media.removeEventListener?.('change', sync);
  }, []);

  useEffect(() => {
    const startedAt = Date.now();
    const clock = window.setInterval(() => {
      const current = new Date();
      setNow(current);
      const elapsed = (Date.now() - startedAt) % rotationMs;
      setSecondsToNext(Math.max(1, Math.ceil((rotationMs - elapsed) / 1000)));
    }, 1000);
    const timer = window.setInterval(() => {
      setSlideIndex((current) => (current + 1) % slides.length);
    }, rotationMs);
    return () => {
      window.clearInterval(clock);
      window.clearInterval(timer);
    };
  }, []);

  if (!mounted) return null;

  if (isLoading) {
    return createPortal(<StatePanel tone="loading" title="Cargando Torre de Control" className="fixed inset-0 z-[9999] min-h-screen bg-background" />, document.body);
  }

  if (error) {
    return createPortal(<StatePanel tone="error" title="No se pudo cargar la Torre de Control" description={error.message} className="fixed inset-0 z-[9999] min-h-screen bg-background" />, document.body);
  }

  const slide = slides[slideIndex];
  const SlideIcon = slide.icon;

  return createPortal(
    <div className="motil-control-tower fixed inset-0 z-[9999] flex min-h-screen w-screen flex-col gap-4 overflow-hidden bg-[var(--tower-canvas)] p-5 text-[var(--tower-ink)] 2xl:p-6">
      <header className="grid shrink-0 gap-4 border-b border-[var(--tower-border)] pb-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-3 text-sm font-semibold uppercase tracking-[0.14em] text-[var(--tower-ink-muted)]">
            <Monitor className="h-4 w-4" />
            Compañía Minera La Patagua · Mantenimiento
            <span className="rounded-full bg-[var(--tower-copper-soft)] px-3 py-1 text-xs font-semibold normal-case tracking-normal text-[var(--tower-copper)]">Solo lectura</span>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <SlideIcon className="h-7 w-7 text-[var(--tower-copper)]" />
            <h1 className="text-4xl font-semibold tracking-tight 2xl:text-5xl">{slide.label}</h1>
            <span className="rounded-full border border-[var(--tower-border)] bg-[var(--tower-surface)] px-3 py-1 text-sm font-medium text-[var(--tower-ink-muted)]">Vista {slideIndex + 1} de {slides.length}</span>
          </div>
          <p className="mt-2 text-lg font-medium text-[var(--tower-ink-muted)] 2xl:text-xl">{slide.question}</p>
        </div>
        <div className="grid min-w-[390px] grid-cols-[1fr_auto] gap-x-5 gap-y-1 text-sm text-[var(--tower-ink-muted)]">
          <span>Hora Santiago</span><strong className="text-xl font-semibold tabular-nums text-[var(--tower-ink)]">{now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: SANTIAGO_TIME_ZONE })}</strong>
          <span>Correo mantención</span><span>{dateTime(data?.freshness?.latestEmailAt)}</span>
          <span>WhatsApp vinculado</span><span>{dateTime(data?.freshness?.latestPublishedWhatsAppAt)}</span>
          <span>Actualización pantalla</span><span>{dateTime(data?.generatedAt)}</span>
        </div>
      </header>

      <section className="grid shrink-0 gap-px overflow-hidden rounded-lg border border-[var(--tower-border)] bg-[var(--tower-border)] md:grid-cols-5">
        <TopMetric tone="copper" icon={AlertTriangle} label="Atención" value={data?.summary?.attentionAssets} />
        <TopMetric tone="ink" icon={ShieldAlert} label="Detenidos reportados" value={data?.summary?.stoppedAssets} />
        <TopMetric tone="green" icon={Wrench} label="OT abiertas" value={data?.summary?.openWorkOrders} />
        <TopMetric tone="copper" icon={TimerReset} label="MP vencidas" value={data?.summary?.preventiveOverdue} />
        <TopMetric
          tone="green"
          icon={Radio}
          label="Entradas por revisar"
          value={Number(data?.summary?.pendingEmailMatches || 0) + Number(data?.summary?.pendingWhatsAppInputs || 0)}
        />
      </section>

      <main
        key={slide.key}
        className={cn(
          'min-h-0 flex-1 overflow-hidden rounded-lg border border-[var(--tower-border)] bg-[var(--tower-surface)]',
          !reduceMotion && 'animate-in fade-in duration-300',
        )}
      >
        {slide.key === 'analysis' ? <AnalysisSlide data={data} /> : null}
        {slide.key === 'stopped' ? <StoppedSlide data={data} /> : null}
        {slide.key === 'preventive' ? <PreventiveSlide data={data} /> : null}
        {slide.key === 'schedule' ? <ScheduleSlide data={data} /> : null}
        {slide.key === 'fleet' ? <FleetSlide data={data} /> : null}
        {slide.key === 'management' ? <ManagementSlide data={data} /> : null}
      </main>

      <footer className="shrink-0 border-t border-[var(--tower-border)] pt-2">
        <div className="flex items-center justify-between gap-4 text-sm text-[var(--tower-ink-muted)]">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4" />
            Próxima vista en {secondsToNext} s · datos cada {data?.refreshSeconds || 60} s
          </div>
          <div className="flex items-center gap-1.5" aria-label="Progreso de vistas">
            {slides.map((item, index) => (
              <span
                key={item.key}
                className={cn('h-1.5 rounded-full transition-[width] duration-300', index === slideIndex ? 'w-8 bg-[var(--tower-copper)]' : 'w-3 bg-[var(--tower-border)]')}
              />
            ))}
          </div>
          <div>{data?.summary?.activeAssets || 0}/{data?.summary?.canonicalAssets || 0} equipos con señal actual · corte {data?.operationalCutoff || 'sin corte'}</div>
        </div>
      </footer>
    </div>,
    document.body,
  );
}

function AnalysisSlide({ data }: { data: any }) {
  const attention = Array.isArray(data?.attentionRows) ? data.attentionRows : [];
  const signals = Array.isArray(data?.recentSignals) ? data.recentSignals : [];

  return (
    <div className="grid h-full gap-4 p-4 xl:grid-cols-[1.05fr_.95fr]">
      <Panel title="Prioridades activas" subtitle="Lo que requiere seguimiento inmediato.">
        <div className="divide-y divide-[var(--tower-border)]">
          {attention.slice(0, 5).map((row: any) => (
            <div key={row.canonicalAssetId} className="grid gap-3 py-4 first:pt-0 md:grid-cols-[1fr_auto] md:items-center">
              <div className="min-w-0">
                <p className="truncate text-xl font-semibold">{row.assetName}</p>
                <p className="mt-1 line-clamp-1 text-base text-[var(--tower-ink-muted)]">{signalText(row)}</p>
              </div>
              <div className="flex items-center gap-3">
                <PriorityPill
                  label={row.reportedStopped ? 'Alta' : row.priorityRank <= 2 ? 'Alta' : row.planningPriority || 'Atención'}
                  critical={Boolean(row.reportedStopped || row.priorityRank <= 2)}
                />
                <span className="hidden text-sm text-[var(--tower-ink-muted)] 2xl:inline">
                  {row.site} · {sourceLabel(row.latestSignalSource)} · {ageLabel(row.latestSignalAgeHours)}
                </span>
              </div>
            </div>
          ))}
          {attention.length === 0 ? <EmptyState title="Sin prioridades activas" text="No hay equipos que requieran atención inmediata con evidencia vigente." /> : null}
        </div>
      </Panel>

      <Panel title="Señales recientes" subtitle="Últimas actualizaciones operacionales con origen identificado.">
        <div className="divide-y divide-[var(--tower-border)]">
          {signals.slice(0, 5).map((signal: any) => (
            <div key={`${signal.canonicalAssetId}-${signal.at}-${signal.source}`} className="grid gap-3 py-4 first:pt-0 md:grid-cols-[180px_1fr] md:items-start">
              <div className="flex items-center gap-2 text-base font-semibold">
                <SourceMark source={signal.source} />
                <span>{sourceLabel(signal.source)}</span>
                <span className="font-normal text-[var(--tower-ink-muted)]">· {dateTime(signal.at).split(',').at(-1)?.trim()}</span>
              </div>
              <div>
                <p className="line-clamp-2 text-base font-medium">{signal.text || 'Actualización registrada'}</p>
                <p className="mt-1 text-sm text-[var(--tower-ink-muted)]">{signal.assetName} · {signal.site || 'Sin faena'}</p>
              </div>
            </div>
          ))}
          {signals.length === 0 ? <EmptyState title="Sin señales recientes" text="No hay nuevas actualizaciones operacionales en la ventana vigente." /> : null}
        </div>
      </Panel>
    </div>
  );
}

function StoppedSlide({ data }: { data: any }) {
  const rows = Array.isArray(data?.stoppedRows) ? data.stoppedRows : [];

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="grid gap-px overflow-hidden rounded-md border bg-border md:grid-cols-4">
        <SmallMetric label="Detenidos reportados" value={data?.summary?.stoppedAssets} />
        <SmallMetric label="Críticos con OT" value={data?.summary?.criticalOpenWorkOrders} />
        <SmallMetric label="OT abiertas" value={data?.summary?.openWorkOrders} />
        <SmallMetric label="Repuestos pendientes" value={data?.summary?.partsPendingAssets} />
      </div>
      <Panel title="Detalle de equipos detenidos" subtitle="Sólo condiciones actuales respaldadas por evidencia">
        {rows.length === 0 ? (
          <EmptyState title="Sin equipos detenidos con evidencia vigente" text="No se arrastran estados históricos como detención actual." />
        ) : (
          <DataTable
            headers={['Equipo', 'Faena', 'Estado validado', 'Última señal', 'Antigüedad', 'OT / bloqueo']}
            rows={rows.slice(0, 8).map((row: any) => [
              row.assetName,
              row.site,
              row.canonicalStatus || 'Sin estado validado',
              row.currentReportedStatus || signalText(row),
              ageLabel(row.latestSignalAgeHours),
              `${row.openWorkOrderNumbers?.join(', ') || 'Sin OT'}${row.partsPending ? ' · Repuesto pendiente' : ''}`,
            ])}
          />
        )}
      </Panel>
    </div>
  );
}

function PreventiveSlide({ data }: { data: any }) {
  const rows = Array.isArray(data?.preventiveRows) ? data.preventiveRows : [];
  const pCounts = ['P1', 'P2', 'P3', 'P4', 'P5'].map((priority) => ({
    label: priority,
    value: rows.filter((row: any) => String(row.planningPriority || '').toUpperCase().startsWith(priority)).length,
  }));

  return (
    <div className="grid h-full gap-4 p-4 xl:grid-cols-[1.35fr_.65fr]">
      <Panel title="Mantenciones preventivas" subtitle="Base horaria / kilométrica con evidencia vigente">
        <div className="grid gap-px overflow-hidden rounded-md border bg-border md:grid-cols-4">
          <SmallMetric label="Vencidas" value={data?.summary?.preventiveOverdue} />
          <SmallMetric label="Próximas" value={data?.summary?.preventiveDueSoon} />
          <SmallMetric label="Revisar fecha" value={data?.summary?.preventiveDateReview} />
          <SmallMetric label="Equipos con base" value={data?.summary?.preventiveTracked} />
        </div>
        <div className="mt-4">
          <DataTable
            headers={['Equipo', 'Faena', 'Base', 'Lectura', 'Próx. MP', 'Estado MP']}
            rows={rows.slice(0, 8).map((row: any) => [
              row.assetName,
              row.site,
              row.meterUnit || '—',
              row.currentMeter == null ? '—' : number(row.currentMeter),
              row.nextDueMeter == null ? '—' : number(row.nextDueMeter),
              row.reportedMpStatus || row.planningPriority || 'Sin estado',
            ])}
          />
        </div>
      </Panel>

      <Panel title="Prioridad y base de control" subtitle="Horas, kilómetros y vigencia del plan no se mezclan">
        <BarList rows={pCounts} />
        <div className="mt-5 grid gap-2">
          <BasisRow label="Horas" value={data?.lifecycle?.preventiveBasis?.hours || 0} />
          <BasisRow label="Kilómetros" value={data?.lifecycle?.preventiveBasis?.km || 0} />
          <BasisRow label="Anual" value={data?.lifecycle?.preventiveBasis?.annual || 0} />
          <BasisRow label="Otra / sin unidad" value={data?.lifecycle?.preventiveBasis?.other || 0} />
        </div>
        <div className="mt-4 rounded-md border border-amber-500/25 bg-amber-500/5 p-4">
          <p className="text-sm font-semibold">Plan preventivo vigente</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {data?.lifecycle?.approvedPreventiveSchedules || 0} planes activos · {String(data?.lifecycle?.approvedPreventiveSchedulesBasis || 'Sin información suficiente').replace('Sin base canónica', 'Sin información suficiente')}
          </p>
        </div>
      </Panel>
    </div>
  );
}

function ScheduleSlide({ data }: { data: any }) {
  const rows = Array.isArray(data?.workOrders) ? data.workOrders : [];
  const today = String(data?.coordination?.today || '');
  const tomorrow = String(data?.coordination?.tomorrow || '');
  const open = rows
    .filter((row: any) => !['completed', 'closed', 'cancelled', 'canceled'].includes(String(row.status).toLowerCase()))
    .sort((a: any, b: any) => {
      const rank = (row: any) => row.overdue ? 0 : row.scheduledDate === today ? 1 : row.scheduledDate === tomorrow ? 2 : 3;
      return rank(a) - rank(b) || String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || ''));
    });

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="grid gap-px overflow-hidden rounded-md border bg-border md:grid-cols-5">
        <SmallMetric label="Vencidas" value={data?.summary?.overdueOpenWorkOrders} />
        <SmallMetric label="Para hoy" value={data?.summary?.dueTodayOpenWorkOrders} />
        <SmallMetric label="Para mañana" value={data?.summary?.dueTomorrowOpenWorkOrders} />
        <SmallMetric label="Mañana por confirmar" value={data?.summary?.dueTomorrowNotReadyWorkOrders} />
        <SmallMetric label="Sin responsable" value={data?.summary?.unassignedOpenWorkOrders} />
      </div>
      <Panel
        title="Programa de ejecución"
        subtitle={`Planificación + materiales · stock informado ${dateTime(data?.inventory?.latestAt)} · reservas de Bodega por separado`}
      >
        <DataTable
          headers={['OT', 'Fecha', 'Equipo', 'Responsable', 'Etapa', 'Prioridad', 'Preparación']}
          rows={open.slice(0, 8).map((row: any) => [
            row.workOrderNumber,
            shortDate(row.scheduledDate),
            row.assetName,
            row.assignedTo || 'Sin responsable',
            `${row.overdue ? 'Vencida · ' : row.scheduledDate === today ? 'Hoy · ' : row.scheduledDate === tomorrow ? 'Mañana · ' : ''}${row.lifecycleStage || statusLabel(row.status)}`,
            row.priority || '—',
            row.executionReadiness || 'Por confirmar',
          ])}
        />
      </Panel>
      <div className="grid gap-2 md:grid-cols-3">
        <BasisRow label="SKUs Bodega vinculados" value={data?.inventory?.matchedCanonicalSkus || 0} />
        <BasisRow label="SKUs con stock usable" value={data?.inventory?.positiveStockSkus || 0} />
        <BasisRow label="SKUs en conciliación" value={data?.inventory?.conflictedSkus || 0} />
      </div>
      {open.length === 0 ? <EmptyState title="Sin OT abiertas" text="No hay trabajo activo pendiente de coordinación." /> : null}
    </div>
  );
}

function FleetSlide({ data }: { data: any }) {
  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const sites = useMemo(() => {
    const map = new Map<string, { total: number; attention: number; stopped: number; latestAt: string | null; email: number; whatsapp: number }>();
    rows.forEach((row: any) => {
      const site = row.site || 'Sin faena';
      const current = map.get(site) || { total: 0, attention: 0, stopped: 0, latestAt: null, email: 0, whatsapp: 0 };
      current.total += 1;
      if (row.reportedStopped || row.openWorkOrders > 0 || row.priorityRank <= 2 || row.partsPending) current.attention += 1;
      if (row.reportedStopped) current.stopped += 1;
      if (row.emailCurrent) current.email += 1;
      if (row.whatsappCurrent) current.whatsapp += 1;
      if (row.latestSignalAt && (!current.latestAt || String(row.latestSignalAt) > current.latestAt)) current.latestAt = String(row.latestSignalAt);
      map.set(site, current);
    });
    return [...map.entries()].map(([label, value]) => ({ label, ...value })).sort((a, b) => b.total - a.total);
  }, [rows]);

  return (
    <div className="grid h-full gap-4 p-4 xl:grid-cols-[1fr_1fr]">
      <Panel title="Condición por unidad operacional" subtitle="Cobertura del maestro vivo">
        <div className="space-y-3">
          {sites.slice(0, 8).map((site) => (
            <div key={site.label}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium">{site.label}</span>
                <span className="text-muted-foreground">{site.total} equipos · {site.attention} atención · {site.stopped} detenidos · {dateTime(site.latestAt)}</span>
              </div>
              <div className="mb-1 text-[10px] text-muted-foreground">Correo {site.email} · WhatsApp {site.whatsapp}</div>
              <div className="flex h-4 overflow-hidden rounded bg-muted">
                <div className="bg-emerald-500/70" style={{ width: `${site.total ? ((site.total - site.attention) / site.total) * 100 : 0}%` }} />
                <div className="bg-amber-500/70" style={{ width: `${site.total ? ((site.attention - site.stopped) / site.total) * 100 : 0}%` }} />
                <div className="bg-destructive/80" style={{ width: `${site.total ? (site.stopped / site.total) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Equipos que requieren atención" subtitle="Prioridad, OT, repuestos y señal reciente">
        <DataTable
          headers={['Equipo', 'Faena', 'Prioridad', 'OT', 'Repuestos', 'Fuente']}
          rows={(data?.attentionRows || []).slice(0, 8).map((row: any) => [
            row.assetName,
            row.site,
            row.reportedStopped ? 'DETENIDO' : row.planningPriority || 'Atención',
            row.openWorkOrders || '—',
            row.partsPending ? 'Pendiente' : '—',
            sourceLabel(row.latestSignalSource),
          ])}
        />
      </Panel>
    </div>
  );
}

function ManagementSlide({ data }: { data: any }) {
  const management = data?.management || {};
  const coordination = Array.isArray(data?.coordination?.byAssignee) ? data.coordination.byAssignee : [];
  const completed = Number(data?.summary?.completedWorkOrders || 0);
  const open = Number(data?.summary?.openWorkOrders || 0);
  const total = completed + open;
  const completionPct = total > 0 ? (completed / total) * 100 : null;
  const preventive = Number(management.preventiveCompleted || 0);
  const corrective = Number(management.correctiveCompleted || 0);
  const workMixTotal = preventive + corrective;

  return (
    <div className="grid h-full gap-4 p-4 xl:grid-cols-[1fr_1fr]">
      <Panel title="Indicadores de gestión" subtitle="Sólo métricas con información suficiente">
        <div className="grid gap-3 md:grid-cols-2">
          <ManagementMetric label="OT registradas cerradas" value={completionPct == null ? '—' : `${number(completionPct, 0)}%`} detail={total ? `${completed} terminadas de ${total} registradas` : 'Sin base'} />
          <ManagementMetric label="Backlog abierto" value={open || '—'} detail={open ? `${data?.summary?.overdueOpenWorkOrders || 0} vencidas` : 'Sin OT abiertas'} />
          <ManagementMetric label="HH planificadas cerradas" value={number(management.plannedHoursCompleted)} detail="OT terminadas" />
          <ManagementMetric label="HH reales cerradas" value={number(management.actualHoursCompleted)} detail="OT terminadas" />
          <ManagementMetric
            label="OT críticas abiertas"
            value={data?.summary?.criticalOpenWorkOrders ?? '—'}
            detail="Prioridad alta o crítica todavía abierta"
          />
          <ManagementMetric label="Horas detención registradas" value={number(management.recordedDowntimeHours)} detail={management.recordedDowntimeHours == null ? 'Sin base suficiente' : 'OT con dato explícito'} />
        </div>
      </Panel>

      <Panel title="Coordinación del equipo" subtitle="Carga abierta por responsable; apoyo para planificar y destrabar">
        <DataTable
          headers={['Responsable', 'Abiertas', 'Vencidas', 'Hoy', 'Mañana', 'Alta/Crítica']}
          rows={coordination.slice(0, 6).map((row: any) => [
            row.assignee,
            row.open,
            row.overdue,
            row.dueToday,
            row.dueTomorrow,
            row.highCritical,
          ])}
        />
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <ManagementMetric
            label="Preventivas terminadas"
            value={workMixTotal ? preventive : '—'}
            detail={workMixTotal ? `${number((preventive / workMixTotal) * 100, 0)}% del mix cerrado` : 'Sin base'}
          />
          <ManagementMetric
            label="Correctivas terminadas"
            value={workMixTotal ? corrective : '—'}
            detail={workMixTotal ? `${number((corrective / workMixTotal) * 100, 0)}% del mix cerrado` : 'Sin base'}
          />
        </div>
      </Panel>
    </div>
  );
}

function BasisRow({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/10 px-3 py-2 text-xs">
      <span className="font-medium">{label}</span>
      <span className="text-lg font-semibold tabular-nums">{number(value, 0)}</span>
    </div>
  );
}

function SourceHealth({ label, inputAt, publishedAt, pending }: { label: string; inputAt: unknown; publishedAt: unknown; pending: unknown }) {
  const pendingCount = Number(pending || 0);
  return (
    <div className="grid gap-1 rounded-md border bg-muted/10 px-3 py-2 text-xs">
      <div className="flex items-center justify-between gap-3">
        <span className="font-semibold">{label}</span>
        <Badge variant={pendingCount > 0 ? 'secondary' : 'outline'}>
          {pendingCount > 0 ? `${pendingCount} por revisar` : 'al día'}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        <span>Entrada: {dateTime(inputAt)}</span>
        <span>Vinculado: {dateTime(publishedAt)}</span>
      </div>
    </div>
  );
}


function PriorityPill({ label, critical }: { label: string; critical: boolean }) {
  return (
    <span className={cn(
      'rounded-md px-3 py-1.5 text-sm font-semibold',
      critical
        ? 'bg-[var(--tower-copper-soft)] text-[var(--tower-copper)]'
        : 'bg-[var(--tower-green-soft)] text-[var(--tower-green)]',
    )}>
      {label}
    </span>
  );
}

function SourceMark({ source }: { source: unknown }) {
  const isGreen = source === 'whatsapp' || source === 'canonical_status';
  return <span className={cn('h-2.5 w-2.5 rounded-full', isGreen ? 'bg-[var(--tower-green)]' : 'bg-[var(--tower-copper)]')} aria-hidden="true" />;
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="min-h-0 overflow-hidden rounded-lg border border-[var(--tower-border)] bg-[var(--tower-surface)]">
      <div className="border-b border-[var(--tower-border)] bg-[var(--tower-surface-muted)] px-5 py-3.5">
        <p className="text-xl font-semibold 2xl:text-2xl">{title}</p>
        {subtitle ? <p className="mt-1 text-base text-[var(--tower-ink-muted)]">{subtitle}</p> : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function TopMetric({ icon: Icon, label, value, tone = 'ink' }: { icon: any; label: string; value: unknown; tone?: 'copper' | 'green' | 'ink' }) {
  const toneClass = tone === 'copper'
    ? 'text-[var(--tower-copper)]'
    : tone === 'green'
      ? 'text-[var(--tower-green)]'
      : 'text-[var(--tower-ink)]';
  return (
    <div className="bg-[var(--tower-surface)] px-5 py-4">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--tower-ink)]"><Icon className={cn('h-5 w-5', toneClass)} />{label}</div>
      <p className={cn('mt-1 text-4xl font-semibold tabular-nums 2xl:text-5xl', toneClass)}>{value == null ? '—' : number(value, 0)}</p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="bg-card px-5 py-4">
      <p className="text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums">{value == null ? '—' : number(value, 0)}</p>
    </div>
  );
}

function Insight({ tone, title, value, text }: { tone: 'critical' | 'warning' | 'neutral'; title: string; value: unknown; text: string }) {
  return (
    <div className={cn(
      'rounded-md border p-4',
      tone === 'critical' && 'border-destructive/30 bg-destructive/5',
      tone === 'warning' && 'border-amber-500/30 bg-amber-500/5',
      tone === 'neutral' && 'bg-muted/20',
    )}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold">{title}</p>
        <p className="text-2xl font-semibold tabular-nums">{value == null ? '—' : number(value, 0)}</p>
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{text}</p>
    </div>
  );
}

function ManagementMetric({ label, value, detail }: { label: string; value: React.ReactNode; detail: string }) {
  return (
    <div className="rounded-md border bg-muted/10 p-4">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex min-h-40 items-center justify-center rounded-md border border-dashed p-8 text-center">
      <div>
        <p className="text-sm font-semibold">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="overflow-hidden rounded-md border">
      <div className="grid bg-muted/40 text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>
        {headers.map((header) => <div key={header} className="px-4 py-3">{header}</div>)}
      </div>
      <div className="divide-y">
        {rows.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">Sin registros para esta vista.</div>
        ) : rows.map((row, rowIndex) => (
          <div key={rowIndex} className="grid text-xs" style={{ gridTemplateColumns: `repeat(${headers.length}, minmax(0, 1fr))` }}>
            {row.map((cell, cellIndex) => (
              <div key={cellIndex} className={cn('min-w-0 truncate px-4 py-4 text-base 2xl:text-lg', cellIndex === 0 && 'font-semibold text-foreground')}>
                {cell ?? '—'}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function BarList({ rows }: { rows: Array<{ label: string; value: number }> }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="font-medium">{row.label}</span>
            <span className="tabular-nums text-muted-foreground">{row.value}</span>
          </div>
          <div className="h-3 overflow-hidden rounded bg-muted">
            <div className="h-full bg-primary/75" style={{ width: `${(row.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function DonutLike({ primary, secondary, primaryLabel, secondaryLabel }: { primary: number; secondary: number; primaryLabel: string; secondaryLabel: string }) {
  const total = Math.max(1, primary + secondary);
  const primaryPct = (primary / total) * 100;
  return (
    <div className="grid items-center gap-5 md:grid-cols-[180px_1fr]">
      <div
        className="mx-auto grid h-44 w-44 place-items-center rounded-full"
        style={{ background: `conic-gradient(hsl(var(--primary)) 0 ${primaryPct}%, hsl(var(--muted)) ${primaryPct}% 100%)` }}
      >
        <div className="grid h-28 w-28 place-items-center rounded-full bg-background text-center">
          <div><p className="text-3xl font-semibold">{primary + secondary}</p><p className="text-[10px] uppercase tracking-[0.1em] text-muted-foreground">OT</p></div>
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between border-b pb-2"><span>{primaryLabel}</span><span className="font-semibold">{primary}</span></div>
        <div className="flex items-center justify-between border-b pb-2"><span>{secondaryLabel}</span><span className="font-semibold">{secondary}</span></div>
      </div>
    </div>
  );
}
