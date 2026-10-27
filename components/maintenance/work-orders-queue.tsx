'use client';
import { daysUntilWorkOrderDate, isWorkOrderScheduledOverdue } from '@/lib/maintenance/work-order-calendar-date.mjs';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertCircle, ChevronRight, Inbox, Plus, Search, Siren } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MaintenanceSchedule } from '@/components/maintenance/maintenance-schedule';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';
import { formatWorkOrderNumber } from '@/lib/maintenance/work-order-display';

type WorkOrderItem = {
  id: string;
  status: string | null;
  priority: string | null;
  scheduled_date: string | null;
  asset_name: string | null;
  work_order_number: string | null;
  title: string | null;
  work_type?: string | null;
  assigned_to_name?: string | null;
  completion_date?: string | null;
  approval_status?: string | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  record_scope?: 'operational' | 'historical';
};

type ScheduleItem = {
  id: string;
  assetName: string;
  taskName: string;
  nextScheduledDate: string;
  priority: 'high' | 'medium' | 'low';
  daysUntil: number;
};

type WorkOrdersT = Dictionary['app']['workOrders'];

function normalizeText(value: string | null | undefined) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

function getStatusLabel(status: string | null | undefined, t: WorkOrdersT) {
  const value = normalizeText(status);
  if (['completed', 'completado'].includes(value)) return t.status.completed;
  if (['cancelled', 'canceled', 'cancelada', 'anulada'].includes(value)) return 'Anulada';
  if (['in_progress', 'en_progreso'].includes(value)) return t.status.inProgress;
  if (['open', 'abierta', 'pending', 'pendiente'].includes(value)) return t.status.open;
  return status || t.status.none;
}

function getWorkTypeLabel(workType: string | null | undefined, t: WorkOrdersT) {
  const value = normalizeText(workType);
  if (value === 'corrective') return t.workType.corrective;
  if (value === 'preventive') return t.workType.preventive;
  if (value === 'predictive') return t.workType.predictive;
  if (value === 'emergency') return 'Emergencia';
  return workType || t.workType.none;
}

function getPriorityLabel(priority: string | null | undefined, t: WorkOrdersT) {
  const value = normalizeText(priority);
  if (['critical', 'urgente'].includes(value)) return t.priority.critical;
  if (['high', 'alta'].includes(value)) return t.priority.high;
  if (['medium', 'media'].includes(value)) return t.priority.medium;
  if (['low', 'baja'].includes(value)) return t.priority.low;
  return priority || t.priority.none;
}

function isOverdue(order: WorkOrderItem) {
  if (!order.scheduled_date || ['completed', 'completado'].includes(normalizeText(order.status))) return false;
  return isWorkOrderScheduledOverdue(order.scheduled_date);
}

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

export function WorkOrdersQueue({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const t = dictionary.app.workOrders;
  const dateLocale = locale === 'en' ? 'en-US' : 'es-CL';
  const searchParams = useSearchParams();
  const missingAssetOnly = searchParams.get('dataHealth') === 'missing_asset';
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [viewFilter, setViewFilter] = useState<'all' | 'active' | 'approval' | 'completed' | 'historical'>('active');

  const fetcher = async (url: string) => {
    const response = await fetch(url, { credentials: 'include' });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.error || 'request failed');
    return payload;
  };

  const { data, error, isLoading, mutate } = useSWR('/api/maintenance/work-orders', fetcher);
  const { data: viewerContext } = useSWR('/api/maintenance/viewer-context', fetcher, { revalidateOnFocus: false });
  const canCreateWorkOrder = Boolean(viewerContext?.canCreateWorkOrder);
  const canCreateEmergencyWorkOrder = Boolean(viewerContext?.canCreateEmergencyWorkOrder);

  const workOrders = Array.isArray(data?.workOrders) ? (data.workOrders as WorkOrderItem[]) : [];
  const operationalWorkOrders = workOrders.filter((order) => order.record_scope !== 'historical');
  const historicalWorkOrders = workOrders.filter((order) => order.record_scope === 'historical');
  const open = operationalWorkOrders.filter((order) => ['open', 'pending', 'abierta', 'pendiente'].includes(normalizeText(order.status))).length;
  const inProgress = operationalWorkOrders.filter((order) => ['in_progress', 'en_progreso'].includes(normalizeText(order.status))).length;
  const critical = operationalWorkOrders.filter((order) => ['critical', 'urgente'].includes(normalizeText(order.priority))).length;
  const overdue = operationalWorkOrders.filter(isOverdue).length;
  const completedOrders = operationalWorkOrders.filter((order) => ['completed', 'completado'].includes(normalizeText(order.status)));
  const pendingApproval = completedOrders.filter((order) => normalizeText(order.approval_status) !== 'approved').length;

  const filteredOrders = useMemo(() => {
    const query = normalizeText(search);
    return workOrders.filter((order) => {
      const status = normalizeText(order.status);
      const completed = ['completed', 'completado'].includes(status);
      const cancelled = ['cancelled', 'canceled', 'cancelada', 'anulada'].includes(status);
      const operational = order.record_scope !== 'historical';
      const matchesView = missingAssetOnly
        ? operational
        : viewFilter === 'all'
          ? operational
          : viewFilter === 'historical'
            ? order.record_scope === 'historical'
          : viewFilter === 'approval'
            ? operational && completed && normalizeText(order.approval_status) !== 'approved'
            : viewFilter === 'completed'
              ? operational && completed
              : operational && !completed && !cancelled;
      const matchesDataHealth = !missingAssetOnly || !order.asset_name;
      const matchesSearch = !query || [order.work_order_number, formatWorkOrderNumber(order.work_order_number, locale), order.title, order.asset_name, order.assigned_to_name].some((value) => normalizeText(value).includes(query));
      const matchesStatus = statusFilter === 'all' || normalizeText(order.status) === statusFilter;
      const matchesPriority = priorityFilter === 'all' || normalizeText(order.priority) === priorityFilter;
      return matchesView && matchesDataHealth && matchesSearch && matchesStatus && matchesPriority;
    });
  }, [locale, missingAssetOnly, priorityFilter, search, statusFilter, viewFilter, workOrders]);

  const scheduleItems = useMemo(() => operationalWorkOrders
    .filter((order) => order.scheduled_date && !['completed', 'completado'].includes(normalizeText(order.status)))
    .map((order): ScheduleItem => {
      const daysUntil = daysUntilWorkOrderDate(order.scheduled_date);
      const priority = normalizeText(order.priority);
      return {
        id: order.id,
        assetName: order.asset_name || t.noAsset,
        taskName: `${formatWorkOrderNumber(order.work_order_number, locale)} · ${order.title || t.untitled}`,
        nextScheduledDate: order.scheduled_date || '',
        priority: priority === 'critical' || priority === 'high' ? 'high' : priority === 'low' ? 'low' : 'medium',
        daysUntil: daysUntil ?? 9999,
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 7), [locale, operationalWorkOrders, t]);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-border/70 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{t.eyebrow}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">{t.title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{data?.workshopSite ? `${t.title} · ${locale === 'en' ? 'Mine' : 'Mina'} ${data.workshopSite}` : (missingAssetOnly ? t.descriptionDataHealth : t.descriptionDefault)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {missingAssetOnly ? <Button asChild variant="outline"><Link href="/dashboard/mantenimiento/ordenes-trabajo">{t.viewAll}</Link></Button> : null}

          {canCreateEmergencyWorkOrder ? <Button asChild variant="outline"><Link href="/dashboard/mantenimiento/ordenes-trabajo/create?mode=emergency"><Siren className="mr-2 h-4 w-4" />OTe emergencia</Link></Button> : null}
          {canCreateWorkOrder ? <Button asChild><Link href="/dashboard/mantenimiento/ordenes-trabajo/create"><Plus className="mr-2 h-4 w-4" />{t.newOrder}</Link></Button> : null}
        </div>
      </section>

      {missingAssetOnly ? <Card className="border-destructive/30 bg-destructive/5 shadow-none"><CardContent className="flex items-start gap-3 p-4"><AlertCircle className="mt-0.5 h-5 w-5 text-destructive" /><div><p className="font-medium">{t.dataHealthBanner.title}</p><p className="mt-1 text-sm text-muted-foreground">{t.dataHealthBanner.description}</p></div></CardContent></Card> : null}



      {!missingAssetOnly && historicalWorkOrders.length > 0 ? <Card className="shadow-none"><CardContent className="flex flex-col gap-2 p-4 text-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{t.historicalBanner.title}</p><p className="text-muted-foreground">{fill(t.historicalBanner.description, { n: historicalWorkOrders.length })}</p></div><Button variant="outline" size="sm" onClick={() => setViewFilter('historical')}>{t.historicalBanner.cta}</Button></CardContent></Card> : null}

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">{missingAssetOnly ? t.listTitles.missingAsset : viewFilter === 'historical' ? t.listTitles.historical : viewFilter === 'approval' ? t.listTitles.approval : viewFilter === 'completed' ? t.listTitles.completed : t.listTitles.operational}</CardTitle>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{fill(t.counts, { filtered: filteredOrders.length, total: workOrders.length })}</p>
              {!missingAssetOnly ? (
                <div className="mt-3 flex flex-wrap gap-1 rounded-md border bg-background p-1">
                  <Button size="sm" variant={viewFilter === 'active' ? 'secondary' : 'ghost'} onClick={() => setViewFilter('active')}>{t.inboxViews.active}</Button>
                  <Button size="sm" variant={viewFilter === 'all' ? 'secondary' : 'ghost'} onClick={() => setViewFilter('all')}>Todas · {operationalWorkOrders.length}</Button>
                  <Button size="sm" variant={viewFilter === 'approval' ? 'secondary' : 'ghost'} onClick={() => setViewFilter('approval')}>{t.inboxViews.approval}{pendingApproval ? ` · ${pendingApproval}` : ''}</Button>
                  <Button size="sm" variant={viewFilter === 'completed' ? 'secondary' : 'ghost'} onClick={() => setViewFilter('completed')}>{t.inboxViews.completed}{completedOrders.length ? ` · ${completedOrders.length}` : ''}</Button>
                </div>
              ) : null}
            </div>
            <details className="rounded-md border bg-card" data-testid="ot-more-filters">
              <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Buscar y filtrar</summary>
              <div className="border-t p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1fr)_160px_160px_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t.filters.searchPlaceholder} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><SelectValue placeholder={t.filters.status} /></SelectTrigger><SelectContent><SelectItem value="all">{t.filters.statuses.all}</SelectItem><SelectItem value="open">{t.filters.statuses.open}</SelectItem><SelectItem value="in_progress">{t.filters.statuses.inProgress}</SelectItem><SelectItem value="completed">{t.filters.statuses.completed}</SelectItem></SelectContent></Select>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}><SelectTrigger><SelectValue placeholder={t.filters.priority} /></SelectTrigger><SelectContent><SelectItem value="all">{t.filters.priorities.all}</SelectItem><SelectItem value="critical">{t.filters.priorities.critical}</SelectItem><SelectItem value="high">{t.filters.priorities.high}</SelectItem><SelectItem value="medium">{t.filters.priorities.medium}</SelectItem><SelectItem value="low">{t.filters.priorities.low}</SelectItem></SelectContent></Select>
              <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all'); setPriorityFilter('all'); setViewFilter('active'); }}>{t.filters.clear}</Button>
            </div>
              </div>
            </details>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-20 animate-pulse bg-muted/30" />)}</div>
          ) : error ? (
            <div className="p-8 text-center"><p className="font-medium text-destructive">{t.states.loadError}</p><Button className="mt-4" variant="outline" onClick={() => void mutate()}>{t.states.retry}</Button></div>
          ) : filteredOrders.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">{missingAssetOnly ? t.states.emptyDataHealth : t.states.empty}</div>
          ) : (
            <div className="divide-y">
              <div className="hidden grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(100px,.7fr)_90px] gap-4 bg-muted/20 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground lg:grid">
                <span>OT</span><span>Equipo</span><span>Responsable</span><span>Estado</span><span>Acción</span>
              </div>
              {filteredOrders.map((order) => {
                const historical = order.record_scope === 'historical';
                const status = normalizeText(order.status);
                const completed = ['completed', 'completado'].includes(status);
                const approved = normalizeText(order.approval_status) === 'approved';
                const nextAction = completed
                  ? approved ? t.approval.record : t.approval.review
                  : ['in_progress', 'en_progreso'].includes(status) ? 'Continuar' : 'Abrir';
                const stateLabel = completed && !historical
                  ? approved ? t.approval.approved : t.approval.pending
                  : getStatusLabel(order.status, t);
                return (
                  <Link
                    key={order.id}
                    href={`/dashboard/mantenimiento/ordenes-trabajo/${order.id}`}
                    className="group grid gap-2 px-4 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:grid-cols-[minmax(220px,2fr)_minmax(120px,1fr)_minmax(120px,1fr)_minmax(100px,.7fr)_90px] lg:items-center lg:gap-4"
                    aria-label={`${formatWorkOrderNumber(order.work_order_number, locale)} · ${order.title || t.untitled} · ${stateLabel} · ${nextAction}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{order.title || t.untitled}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{order.work_order_number ? formatWorkOrderNumber(order.work_order_number, locale) : t.noFolio}</p>
                    </div>
                    <p className="truncate text-sm text-muted-foreground">{order.asset_name || (historical ? t.noAssetHistorical : t.noAsset)}</p>
                    <p className="truncate text-sm text-muted-foreground">{order.assigned_to_name || t.unassigned}</p>
                    <p className="flex items-center gap-2 text-xs font-medium">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${completed ? approved ? 'bg-emerald-500' : 'bg-amber-500' : ['in_progress', 'en_progreso'].includes(status) ? 'bg-blue-500' : isOverdue(order) ? 'bg-destructive' : 'bg-amber-500'}`} aria-hidden="true" />
                      {stateLabel}
                    </p>
                    <p className="flex items-center gap-1 text-xs font-medium">{nextAction}<ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></p>
                  </Link>
                );

              })}
            </div>
          )}
        </CardContent>
      </Card>

      <details data-testid="ot-more-indicators" className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ver resumen</summary>
        <div className="border-t p-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([[t.summary.open, open], [t.summary.inProgress, inProgress], [t.summary.critical, critical], [t.summary.overdue, overdue]] as const).map(([label, value]) => (
          <Card key={String(label)} className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{String(label)}</p><p className="mt-1 text-2xl font-semibold">{Number(value)}</p><p className="mt-1 text-[11px] text-muted-foreground">{t.summary.footer}</p></CardContent></Card>
        ))}
      </div>
        </div>
      </details>

      {!missingAssetOnly && scheduleItems.length > 0 ? (
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">{t.schedule.title} · {scheduleItems.length}</summary>
          <div className="border-t p-4"><MaintenanceSchedule schedules={scheduleItems} /></div>
        </details>
      ) : null}
    </div>
  );
}
