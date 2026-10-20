'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  Maximize2,
  RefreshCw,
  Wrench,
} from 'lucide-react';
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

type EquipmentRow = {
  id: string;
  code: string | null;
  name: string;
  status: string | null;
  criticality: string | null;
  specs?: {
    location?: string | null;
    source_file?: string | null;
    updated_at?: string | null;
  } | null;
  operational?: {
    openWorkOrders?: number;
    operationalBlockers?: number;
    overduePreventives?: number;
    nextPreventiveTask?: string | null;
    nextPreventiveRemainingHours?: number | null;
    latestMeterHours?: number | null;
    runtimeReadingCount?: number;
  } | null;
};

type PreventiveTask = {
  schedule_id: string;
  canonical_asset_id: string | null;
  asset_code: string | null;
  asset_name: string | null;
  task_name: string | null;
  remaining_hours: number | string | null;
  effective_current_meter: number | string | null;
  hour_status: string | null;
  alert_due: boolean | null;
  generated_work_order_id: string | null;
  meter_evidence_source?: string | null;
  source_reference?: string | null;
};

type WorkOrder = {
  id: string;
  work_order_number: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  assigned_to_name: string | null;
  scheduled_date: string | null;
  asset_name: string | null;
  asset_code: string | null;
  work_type: string | null;
  record_scope?: string | null;
};

type RuntimeReading = {
  id: string;
  canonical_asset_id: string;
  meter_hours: number | string | null;
  recorded_at: string | null;
  source_type: string | null;
  source_reference: string | null;
};

type RuntimeAsset = { id: string; asset_code: string | null; name: string | null };

type SourceImport = {
  id: string;
  source_file: string | null;
  source_owner: string | null;
  source_role: string | null;
  source_sheet: string | null;
  imported_at: string | null;
  status: string | null;
};

type CostAsset = {
  id: string;
  assetName: string;
  assetCode: string | null;
  totalCost: number;
  rows?: number;
  lastDate?: string | null;
};

type TowerData = {
  control: ControlCenterResponse;
  equipment: { equipment?: EquipmentRow[]; total?: number; summary?: Record<string, number> };
  preventive: { tasks?: PreventiveTask[]; summary?: Record<string, number> };
  workOrders: { workOrders?: WorkOrder[] };
  runtime: { readings?: RuntimeReading[]; assets?: RuntimeAsset[]; reconciliationQueue?: unknown[] };
  sources: { data?: SourceImport[]; summary?: Record<string, number> };
  costs: { summary?: { totalCost?: number; assets?: number }; assetCosts?: CostAsset[] };
};

const loadJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `No se pudo cargar ${url}`);
  return payload as T;
};

const fetchTower = async (): Promise<TowerData> => {
  const [control, equipment, preventive, workOrders, runtime, sources, costs] = await Promise.all([
    loadJson<ControlCenterResponse>('/api/maintenance/control-center'),
    loadJson<TowerData['equipment']>('/api/maintenance/equipment'),
    loadJson<TowerData['preventive']>('/api/maintenance/preventive-hours'),
    loadJson<TowerData['workOrders']>('/api/maintenance/work-orders?scope=operational&limit=100'),
    loadJson<TowerData['runtime']>('/api/maintenance/runtime-readings'),
    loadJson<TowerData['sources']>('/api/maintenance/sources'),
    loadJson<TowerData['costs']>('/api/maintenance/equipment-costs'),
  ]);
  return { control, equipment, preventive, workOrders, runtime, sources, costs };
};

const VIEWS = [
  { key: 'analysis', title: 'Análisis operativo', subtitle: 'Alertas, recurrencias y decisiones pendientes' },
  { key: 'indicators', title: 'Indicadores de gestión', subtitle: 'Carga actual del departamento con datos validados' },
  { key: 'preventive', title: 'Mantenimientos preventivos', subtitle: 'Vencimientos, saldo y evidencia de lectura' },
  { key: 'program', title: 'Programación de trabajos', subtitle: 'OT de la semana, responsables y estado' },
  { key: 'fleet', title: 'Control general de flota', subtitle: 'Equipo, faena, condición y trabajo pendiente' },
  { key: 'stopped', title: 'Equipos detenidos', subtitle: 'Sólo detenciones respaldadas por estado registrado' },
] as const;

const statusLabel = (status?: string | null) => {
  const value = String(status || '').toLowerCase();
  if (value === 'in_progress') return 'En curso';
  if (value === 'planned' || value === 'open') return 'Programada';
  if (value === 'completed' || value === 'closed') return 'Terminada';
  if (value === 'cancelled' || value === 'canceled') return 'Anulada';
  if (value === 'overdue') return 'Vencido';
  if (value === 'needs_review') return 'Revisar';
  if (value === 'pending') return 'Pendiente';
  return status || 'Sin estado';
};

const compactDate = (value?: string | null) => {
  if (!value) return 'Sin fecha';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(date);
};

const money = (value: number) => new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
}).format(Number(value || 0));

function priorityScore(row: EquipmentRow) {
  return Number(row.operational?.operationalBlockers || 0) * 100
    + Number(row.operational?.overduePreventives || 0) * 20
    + Number(row.operational?.openWorkOrders || 0) * 5;
}

export function MaintenanceControlTower() {
  const { data, error, isLoading, mutate } = useSWR<TowerData>('maintenance-control-tower-v2', fetchTower, {
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
  const actions = useMemo(
    () => (data?.control.actions || [])
      .filter((action) => action.kind !== 'operational_review')
      .slice(0, 4),
    [data?.control.actions],
  );
  const equipment = useMemo(
    () => [...(data?.equipment.equipment || [])].sort((a, b) => priorityScore(b) - priorityScore(a) || a.name.localeCompare(b.name, 'es')).slice(0, 10),
    [data?.equipment.equipment],
  );
  const preventive = useMemo(
    () => (data?.preventive.tasks || [])
      .filter((row) => row.hour_status !== 'ok' || row.alert_due)
      .sort((a, b) => Number(Boolean(b.alert_due)) - Number(Boolean(a.alert_due)) || Number(a.remaining_hours ?? 999999) - Number(b.remaining_hours ?? 999999))
      .slice(0, 10),
    [data?.preventive.tasks],
  );
  const workOrders = useMemo(
    () => (data?.workOrders.workOrders || [])
      .filter((row) => !['completed','closed','cancelled','canceled'].includes(String(row.status || '').toLowerCase()))
      .sort((a, b) => String(a.scheduled_date || '9999').localeCompare(String(b.scheduled_date || '9999')))
      .slice(0, 10),
    [data?.workOrders.workOrders],
  );
  const runtimeAssetMap = useMemo(
    () => new Map((data?.runtime.assets || []).map((row) => [row.id, row])),
    [data?.runtime.assets],
  );
  const readings = useMemo(
    () => (data?.runtime.readings || []).slice(0, 10),
    [data?.runtime.readings],
  );
  const costs = useMemo(
    () => (data?.costs.assetCosts || []).slice(0, 10),
    [data?.costs.assetCosts],
  );
  const sources = useMemo(
    () => (data?.sources.data || []).slice(0, 10),
    [data?.sources.data],
  );
  const summary = data?.control.summary;

  const operationallyStopped = equipment.filter((row) => ['stopped','detenido','down','out_of_service','fuera de servicio'].includes(String(row.status || '').toLowerCase()));
  const knownStatus = equipment.filter((row) => row.status && String(row.status).toLowerCase() !== 'sin estado').length;
  const activeKnown = equipment.filter((row) => ['active','activo','operativo','operational'].includes(String(row.status || '').toLowerCase())).length;
  const completedOrders = (data?.workOrders.workOrders || []).filter((row) => ['completed','closed'].includes(String(row.status || '').toLowerCase())).length;
  const openOrders = (data?.workOrders.workOrders || []).filter((row) => ['open','planned','in_progress'].includes(String(row.status || '').toLowerCase())).length;

  return <div className="min-h-[calc(100vh-7rem)] bg-[#061725] p-4 text-slate-100 lg:p-5">
    <header className="overflow-hidden rounded-xl border border-slate-700/70 border-cyan-900/60 bg-[linear-gradient(90deg,#07131f,#0b2636_55%,#102132)] shadow-2xl">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 lg:px-7">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">Compañía Minera La Patagua</p>
        <h1 className="mt-1 text-3xl font-semibold uppercase tracking-[0.16em] text-sky-200">{current.title}</h1>
        <p className="mt-1 text-sm text-slate-300">Departamento de Mantenimiento Mecánica · Torre de control MOTIL</p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="outline">{viewIndex + 1} / {VIEWS.length}</Badge>
        <Badge variant="outline">Siguiente en {seconds}s</Badge>
        <Button variant="outline" size="sm" onClick={() => void mutate()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
        <Button variant="outline" size="icon" aria-label="Pantalla completa" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 className="h-4 w-4" /></Button>
      </div>
      </div>
    </header>

    {error ? <div className="mt-8 rounded-lg border border-destructive/40 p-6 text-destructive">{error.message}</div> : null}
    {isLoading ? <div className="mt-8 grid gap-4 lg:grid-cols-3">{Array.from({length:6}).map((_,i)=><div key={i} className="h-36 animate-pulse rounded-lg bg-muted" />)}</div> : null}

    {!isLoading && !error && data ? <>
      <section className="mt-4 rounded-xl border border-slate-700/70 border-slate-700/70 bg-[#0a2232] shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-700/70 px-5 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Atención ahora</p>
            <p className="mt-0.5 text-sm text-slate-400">Sólo lo que requiere decisión, revisión o destrabe</p>
          </div>
          <div className="flex gap-2 text-xs">
            <Badge variant="outline">{summary?.operationallyBlocked ?? 0} bloqueos</Badge>
            <Badge variant="outline">{summary?.pendingApprovals ?? 0} por aprobar</Badge>
            <Badge variant="outline">{summary?.unassignedOpenWorkOrders ?? 0} sin responsable</Badge>
          </div>
        </div>
        <div className="grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          {actions.length === 0 ? <div className="col-span-2 flex min-h-24 items-center gap-3 px-5 py-4"><CheckCircle2 className="h-5 w-5 text-slate-400" /><span className="font-medium">Sin acciones críticas pendientes.</span></div> : actions.map((action) => <div key={action.id} className="flex min-w-0 items-start gap-3 px-5 py-4">
            <div className="mt-0.5 rounded-md border border-slate-700/70 p-2">{action.kind === 'operational_blocker' ? <AlertTriangle className="h-4 w-4" /> : <Wrench className="h-4 w-4" />}</div>
            <div className="min-w-0"><p className="font-medium">{action.title}</p><p className="mt-1 line-clamp-2 text-xs text-slate-400">{action.evidence}</p></div>
          </div>)}
        </div>
      </section>

      <section className="mt-5">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold">{current.title}</h2>
            <p className="mt-1 text-sm text-slate-400">{current.subtitle}</p>
          </div>
          <div className="flex gap-1">
            {VIEWS.map((view, index) => <button key={view.key} type="button" aria-label={view.title} onClick={() => { setViewIndex(index); setSeconds(30); }} className={`h-2.5 w-8 rounded-full ${index === viewIndex ? 'bg-primary' : 'bg-muted'}`} />)}
          </div>
        </div>

        {current.key === 'analysis' ? <div className="grid gap-4 lg:grid-cols-[1.05fr_1.35fr_.9fr]">
          <div className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4">
            <p className="text-sm font-semibold text-sky-200">Resumen operativo</p>
            <div className="mt-3 grid gap-2">
              {actions.length === 0 ? <p className="rounded-lg border border-emerald-900/70 bg-emerald-950/20 p-3 text-sm text-emerald-300">Sin alertas críticas pendientes.</p> : actions.map((action) => <div key={action.id} className="rounded-lg border border-slate-700/70 bg-slate-950/20 p-3"><p className="font-medium">{action.title}</p><p className="mt-1 text-xs text-slate-400">{action.evidence}</p></div>)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4">
            <p className="text-sm font-semibold text-sky-200">Equipos que requieren atención</p>
            <div className="mt-3 space-y-2">
              {equipment.filter((row) => priorityScore(row) > 0).slice(0,6).map((row) => <div key={row.id} className="grid grid-cols-[1fr_110px_110px] gap-3 rounded-lg border border-slate-700/60 bg-slate-950/20 px-3 py-2 text-sm"><div><p className="font-medium">{row.name}</p><p className="text-xs text-slate-400">{row.specs?.location || 'Sin ubicación validada'}</p></div><span>{row.operational?.openWorkOrders || 0} OT</span><span>{row.operational?.operationalBlockers ? 'Bloqueado' : row.operational?.overduePreventives ? 'Preventivo' : 'Revisar'}</span></div>)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4">
            <p className="text-sm font-semibold text-sky-200">Señales</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-lg border border-red-900/60 bg-red-950/20 p-4"><p className="text-xs text-slate-400">Bloqueos</p><p className="mt-1 text-3xl font-semibold text-red-300">{summary?.operationallyBlocked ?? 0}</p></div>
              <div className="rounded-lg border border-orange-900/60 bg-orange-950/20 p-4"><p className="text-xs text-slate-400">Por aprobar</p><p className="mt-1 text-3xl font-semibold text-orange-300">{summary?.pendingApprovals ?? 0}</p></div>
              <div className="rounded-lg border border-sky-900/60 bg-sky-950/20 p-4"><p className="text-xs text-slate-400">Repeticiones</p><p className="mt-1 text-3xl font-semibold text-sky-300">{summary?.recurringReliabilityAssets ?? 0}</p></div>
            </div>
          </div>
        </div> : null}

        {current.key === 'indicators' ? <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Equipos', data.equipment.total ?? equipment.length],
              ['Estado conocido', knownStatus],
              ['Operativos registrados', activeKnown],
              ['OT abiertas', openOrders],
              ['OT terminadas', completedOrders],
              ['Por aprobar', summary?.pendingApprovals ?? 0],
            ].map(([label,value]) => <div key={String(label)} className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4"><p className="font-semibold text-sky-200">Carga por estado de OT</p><div className="mt-4 space-y-3">{[['Abiertas',openOrders],['Terminadas',completedOrders],['Sin responsable',summary?.unassignedOpenWorkOrders ?? 0],['Bloqueadas',summary?.operationallyBlocked ?? 0]].map(([label,value]) => <div key={String(label)}><div className="mb-1 flex justify-between text-sm"><span>{label}</span><span>{value}</span></div><div className="h-2 rounded-full bg-slate-800"><div className="h-2 rounded-full bg-sky-500" style={{width:`${Math.min(100, Number(value) * 10)}%`}} /></div></div>)}</div></div>
            <div className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4"><p className="font-semibold text-sky-200">Calidad del estado de flota</p><p className="mt-4 text-4xl font-semibold">{knownStatus} / {data.equipment.total ?? equipment.length}</p><p className="mt-2 text-sm text-slate-400">Equipos con estado operacional explícito. Los restantes no se clasifican como operativos o detenidos hasta tener un estado validado.</p></div>
          </div>
        </div> : null}

        {current.key === 'preventive' ? <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#0a2232]">
          <div className="grid grid-cols-[minmax(220px,1.5fr)_1.4fr_120px_130px_1.2fr] gap-3 border-b border-slate-700/70 bg-slate-900/50 px-4 py-3 text-xs font-medium text-slate-400"><span>Equipo</span><span>Próxima mantención</span><span>Saldo</span><span>Prioridad</span><span>Fuente</span></div>
          {preventive.length === 0 ? <div className="p-10 text-center"><p className="text-lg font-medium">Sin preventivos por horas activos en la vista actual</p><p className="mt-2 text-sm text-slate-400">No se inventan vencimientos cuando la fuente no entrega una pauta activa.</p></div> : preventive.map((row) => <div key={row.schedule_id} className="grid grid-cols-[minmax(220px,1.5fr)_1.4fr_120px_130px_1.2fr] gap-3 border-b border-slate-700/60 px-4 py-3 text-sm last:border-b-0"><div><p className="font-medium">{row.asset_name || row.asset_code || 'Equipo'}</p><p className="text-xs text-slate-400">{row.asset_code || 'Sin código'}</p></div><span>{row.task_name || 'Preventivo'}</span><span>{row.remaining_hours != null ? `${Number(row.remaining_hours).toLocaleString('es-CL')} h` : 'Sin saldo'}</span><span>{row.alert_due ? 'Alta' : statusLabel(row.hour_status)}</span><div><p>{row.meter_evidence_source || 'Sin fuente'}</p><p className="text-xs text-slate-400">{row.source_reference || 'Sin referencia'}</p></div></div>)}
        </div> : null}

        {current.key === 'program' ? <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#0a2232]">
          <div className="grid grid-cols-[120px_minmax(240px,1.6fr)_1fr_1fr_120px_120px] gap-3 border-b border-slate-700/70 bg-slate-900/50 px-4 py-3 text-xs font-medium text-slate-400"><span>OT</span><span>Trabajo</span><span>Equipo</span><span>Responsable</span><span>Fecha</span><span>Estado</span></div>
          {workOrders.length === 0 ? <div className="p-8 text-center text-slate-400">No hay OT operacionales abiertas.</div> : workOrders.map((row) => <div key={row.id} className="grid grid-cols-[120px_minmax(240px,1.6fr)_1fr_1fr_120px_120px] gap-3 border-b border-slate-700/60 px-4 py-3 text-sm last:border-b-0"><span className="font-mono text-xs">{row.work_order_number || 'OT'}</span><div><p className="font-medium">{row.title || 'Sin nombre'}</p><p className="text-xs text-slate-400">{row.work_type === 'general' ? 'Trabajo general' : row.priority ? `Prioridad ${row.priority}` : 'Sin prioridad'}</p></div><span>{row.asset_name || (row.work_type === 'general' ? 'Trabajo general' : 'Sin equipo')}</span><span>{row.assigned_to_name || 'Sin responsable'}</span><span>{row.scheduled_date ? row.scheduled_date.slice(0,10) : 'Sin fecha'}</span><span>{statusLabel(row.status)}</span></div>)}
        </div> : null}

        {current.key === 'stopped' ? <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              ['Detenidos registrados', operationallyStopped.length],
              ['Bloqueos OT', summary?.operationallyBlocked ?? 0],
              ['OT abiertas', openOrders],
              ['Sin responsable', summary?.unassignedOpenWorkOrders ?? 0],
              ['Por aprobar', summary?.pendingApprovals ?? 0],
              ['Estado sin validar', Math.max(0,(data.equipment.total ?? equipment.length)-knownStatus)],
            ].map(([label,value]) => <div key={String(label)} className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#0a2232]">
            <div className="grid grid-cols-[minmax(260px,1.6fr)_1fr_1fr_120px] gap-3 border-b border-slate-700/70 bg-slate-900/50 px-4 py-3 text-xs font-medium text-slate-400"><span>Equipo</span><span>Ubicación</span><span>Estado</span><span>OT abiertas</span></div>
            {operationallyStopped.length === 0 ? <div className="p-10 text-center"><p className="text-lg font-medium">No hay equipos con detención validada en la fuente actual</p><p className="mt-2 text-sm text-slate-400">Los equipos sin estado explícito no se presentan como detenidos.</p></div> : operationallyStopped.slice(0,12).map((row) => <div key={row.id} className="grid grid-cols-[minmax(260px,1.6fr)_1fr_1fr_120px] gap-3 border-b border-slate-700/60 px-4 py-3 text-sm last:border-b-0"><div><p className="font-medium">{row.name}</p><p className="text-xs text-slate-400">{row.code || 'Sin código'}</p></div><span>{row.specs?.location || 'Sin ubicación'}</span><span>{statusLabel(row.status)}</span><span>{row.operational?.openWorkOrders || 0}</span></div>)}
          </div>
        </div> : null}

        {current.key === 'fleet' ? <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#0a2232]">
          <div className="grid grid-cols-[minmax(220px,1.6fr)_1fr_120px_130px_1.2fr_110px] gap-3 border-b bg-slate-900/40 px-4 py-3 text-xs font-medium text-slate-400">
            <span>Equipo</span><span>Faena</span><span>Estado</span><span>Lectura</span><span>Próximo</span><span>OT</span>
          </div>
          {equipment.map((row) => <div key={row.id} className="grid grid-cols-[minmax(220px,1.6fr)_1fr_120px_130px_1.2fr_110px] gap-3 border-b border-slate-700/60 px-4 py-3 text-sm last:border-b-0">
            <div className="min-w-0"><p className="truncate font-medium">{row.name}</p><p className="truncate text-xs text-slate-400">{row.code || 'Sin código'} · {row.criticality || 'Sin criticidad'}</p></div>
            <span className="truncate">{row.specs?.location || 'Sin ubicación'}</span>
            <span>{statusLabel(row.status)}</span>
            <span className="tabular-nums">{row.operational?.latestMeterHours != null ? `${Number(row.operational.latestMeterHours).toLocaleString('es-CL')} h` : 'Sin lectura'}</span>
            <div className="min-w-0"><p className="truncate">{row.operational?.nextPreventiveTask || (row.operational?.operationalBlockers ? 'Resolver bloqueo' : 'Sin preventivo próximo')}</p><p className="text-xs text-slate-400">{row.operational?.nextPreventiveRemainingHours != null ? `${Number(row.operational.nextPreventiveRemainingHours).toLocaleString('es-CL')} h de saldo` : row.specs?.updated_at ? `Actualizado ${compactDate(row.specs.updated_at)}` : 'Sin saldo disponible'}</p></div>
            <span className="tabular-nums">{row.operational?.openWorkOrders || 0}{row.operational?.operationalBlockers ? ` · ${row.operational.operationalBlockers} bloqueo` : ''}</span>
          </div>)}
        </div> : null}

        {false ? <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#0a2232]">
          <div className="grid grid-cols-[minmax(220px,1.5fr)_1.4fr_120px_130px_1.2fr] gap-3 border-b bg-slate-900/40 px-4 py-3 text-xs font-medium text-slate-400">
            <span>Equipo</span><span>Trabajo</span><span>Saldo</span><span>Estado</span><span>Fuente</span>
          </div>
          {preventive.length === 0 ? <div className="p-8 text-center text-slate-400">Sin preventivos que requieran atención.</div> : preventive.map((row) => <div key={row.schedule_id} className="grid grid-cols-[minmax(220px,1.5fr)_1.4fr_120px_130px_1.2fr] gap-3 border-b border-slate-700/60 px-4 py-3 text-sm last:border-b-0">
            <div className="min-w-0"><p className="truncate font-medium">{row.asset_name || row.asset_code || 'Equipo'}</p><p className="text-xs text-slate-400">{row.asset_code || 'Sin código'}</p></div>
            <span className="truncate">{row.task_name || 'Preventivo'}</span>
            <span className="tabular-nums">{row.remaining_hours != null ? `${Number(row.remaining_hours).toLocaleString('es-CL')} h` : 'Sin saldo'}</span>
            <span>{statusLabel(row.hour_status)}</span>
            <div className="min-w-0"><p className="truncate">{row.meter_evidence_source || 'Sin fuente'}</p><p className="truncate text-xs text-slate-400">{row.source_reference || (row.generated_work_order_id ? 'OT ya creada' : 'Sin referencia')}</p></div>
          </div>)}
        </div> : null}

        {false ? <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#0a2232]">
          <div className="grid grid-cols-[120px_minmax(240px,1.6fr)_1fr_1fr_120px_120px] gap-3 border-b bg-slate-900/40 px-4 py-3 text-xs font-medium text-slate-400">
            <span>OT</span><span>Trabajo</span><span>Equipo</span><span>Responsable</span><span>Fecha</span><span>Estado</span>
          </div>
          {workOrders.length === 0 ? <div className="p-8 text-center text-slate-400">No hay OT operacionales abiertas.</div> : workOrders.map((row) => <div key={row.id} className="grid grid-cols-[120px_minmax(240px,1.6fr)_1fr_1fr_120px_120px] gap-3 border-b border-slate-700/60 px-4 py-3 text-sm last:border-b-0">
            <span className="font-mono text-xs">{row.work_order_number || 'OT'}</span>
            <div className="min-w-0"><p className="truncate font-medium">{row.title || 'Sin nombre'}</p><p className="text-xs text-slate-400">{row.work_type === 'general' ? 'Trabajo general' : row.priority ? `Prioridad ${row.priority}` : 'Sin prioridad'}</p></div>
            <span className="truncate">{row.asset_name || (row.work_type === 'general' ? 'Trabajo general' : 'Sin equipo')}</span>
            <span className="truncate">{row.assigned_to_name || 'Sin responsable'}</span>
            <span>{row.scheduled_date ? row.scheduled_date.slice(0,10) : 'Sin fecha'}</span>
            <span>{statusLabel(row.status)}</span>
          </div>)}
        </div> : null}

        {false ? <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#0a2232]">
          <div className="grid grid-cols-[minmax(240px,1.5fr)_150px_160px_1fr_1.2fr] gap-3 border-b bg-slate-900/40 px-4 py-3 text-xs font-medium text-slate-400">
            <span>Equipo</span><span>Lectura</span><span>Fecha</span><span>Canal</span><span>Referencia</span>
          </div>
          {readings.length === 0 ? <div className="p-8 text-center text-slate-400">No hay lecturas registradas.</div> : readings.map((row) => {
            const asset = runtimeAssetMap.get(row.canonical_asset_id);
            return <div key={row.id} className="grid grid-cols-[minmax(240px,1.5fr)_150px_160px_1fr_1.2fr] gap-3 border-b border-slate-700/60 px-4 py-3 text-sm last:border-b-0">
              <div className="min-w-0"><p className="truncate font-medium">{asset?.name || asset?.asset_code || 'Equipo'}</p><p className="text-xs text-slate-400">{asset?.asset_code || 'Sin código'}</p></div>
              <span className="tabular-nums">{row.meter_hours != null ? `${Number(row.meter_hours).toLocaleString('es-CL')} h` : 'Sin lectura'}</span>
              <span>{compactDate(row.recorded_at)}</span>
              <span>{row.source_type === 'manual' ? 'Manual' : row.source_type === 'telemetry' ? 'Telemetría' : row.source_type === 'import' ? 'Importación' : row.source_type || 'Sin canal'}</span>
              <span className="truncate">{row.source_reference || 'Sin referencia'}</span>
            </div>;
          })}
        </div> : null}

        {false ? <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4"><p className="text-xs text-slate-400">Costo registrado</p><p className="mt-1 text-2xl font-semibold">{money(Number(data.costs.summary?.totalCost || 0))}</p></div>
            <div className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4"><p className="text-xs text-slate-400">Equipos con costo</p><p className="mt-1 text-2xl font-semibold">{data.costs.summary?.assets ?? 0}</p></div>
            <div className="rounded-xl border border-slate-700/70 bg-[#0a2232] p-4"><p className="text-xs text-slate-400">Fuente</p><p className="mt-1 text-base font-medium">Movimientos por equipo</p></div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#0a2232]">
            <div className="grid grid-cols-[minmax(260px,1.6fr)_160px_120px_160px] gap-3 border-b bg-slate-900/40 px-4 py-3 text-xs font-medium text-slate-400"><span>Equipo</span><span>Costo</span><span>Registros</span><span>Último movimiento</span></div>
            {costs.map((row) => <div key={row.id} className="grid grid-cols-[minmax(260px,1.6fr)_160px_120px_160px] gap-3 border-b border-slate-700/60 px-4 py-3 text-sm last:border-b-0"><div><p className="font-medium">{row.assetName}</p><p className="text-xs text-slate-400">{row.assetCode || 'Sin código'}</p></div><span className="font-medium tabular-nums">{money(row.totalCost)}</span><span>{row.rows ?? '—'}</span><span>{row.lastDate ? row.lastDate.slice(0,10) : 'Sin fecha'}</span></div>)}
          </div>
        </div> : null}

        {false ? <div className="overflow-hidden rounded-xl border border-slate-700/70 bg-[#0a2232]">
          <div className="grid grid-cols-[minmax(280px,1.8fr)_1fr_1fr_160px_130px] gap-3 border-b bg-slate-900/40 px-4 py-3 text-xs font-medium text-slate-400">
            <span>Archivo</span><span>Hoja</span><span>Responsable</span><span>Recibido</span><span>Estado</span>
          </div>
          {sources.length === 0 ? <div className="p-8 text-center text-slate-400">No hay fuentes de planificación registradas.</div> : sources.map((row) => <div key={row.id} className="grid grid-cols-[minmax(280px,1.8fr)_1fr_1fr_160px_130px] gap-3 border-b border-slate-700/60 px-4 py-3 text-sm last:border-b-0">
            <div className="min-w-0"><p className="truncate font-medium">{row.source_file || 'Archivo'}</p><p className="text-xs text-slate-400">Se conserva como evidencia de origen</p></div>
            <span className="truncate">{row.source_sheet || 'Sin hoja'}</span>
            <span className="truncate">{row.source_owner || row.source_role || 'Sin responsable'}</span>
            <span>{compactDate(row.imported_at)}</span>
            <span>{row.status === 'accepted' || row.status === 'canonical' ? 'Aceptada' : row.status === 'review_required' ? 'Revisar' : statusLabel(row.status)}</span>
          </div>)}
        </div> : null}
      </section>

      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/70 pt-3 text-xs text-slate-400">
        <span>Datos reales de MOTIL · diseño inspirado en la referencia de Ariel · Sondaje fuera del alcance</span>
        <span>Última actualización de pantalla: {new Intl.DateTimeFormat('es-CL', { hour: '2-digit', minute: '2-digit' }).format(new Date())}</span>
      </footer>
    </> : null}
  </div>;
}
