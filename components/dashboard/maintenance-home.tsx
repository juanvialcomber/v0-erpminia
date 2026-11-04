'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Droplets, Gauge, RefreshCw, ShieldAlert, Workflow, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { MobileTerrainPanel } from '@/components/maintenance/mobile-terrain-panel';
import { AutopilotDecisionStrip } from '@/components/maintenance/autopilot-decision-strip';
import { CanonicalMaintenanceOverview } from '@/components/maintenance/canonical-maintenance-overview';
import { WhatsappOperationalUpdates } from '@/components/production/whatsapp-operational-updates';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';

type ActionItem = { id: string; kind: string; priority: number; title: string; description: string; evidence: string; href: string; assetHref?: string | null; waitingSince?: string | null; autopilot?: { state: 'prepared'; risk: 'low' | 'medium' | 'high'; requiresHumanDecision: true; preparedAction: string; authority: string } };
type ChangeItem = { kind: string; title: string; detail: string; href: string; occurredAt: string };
type WeeklyRow = { id: string; workOrderNumber?: string | null; title?: string | null; scheduledDate?: string | null; assignedToName?: string | null; bucket: 'prepared' | 'blocked' | 'execution' | 'closeout'; href: string };
type Response = {
  summary?: { openWorkOrders: number; unassignedOpenWorkOrders: number; overdueHourSchedules: number; unplannedOverdueHourSchedules: number; unplannedOverdueInterventionGroups: number; plannedOverdueHourSchedules: number; pendingOperationalReviews: number; outOfServiceOperationalReviews: number; scheduledToday: number; scheduledThisWeek: number; operationallyBlocked: number; closeoutPending: number; pendingPlanSteps: number; readyToClose: number; pendingApprovals: number; recurringReliabilityAssets: number; totalActions: number };
  decisionOfDay?: ActionItem | null;
  recentChanges?: ChangeItem[];
  weeklyPlan?: {
    window: { today: string; weekStart: string; weekEnd: string };
    summary: { prepared: number; blocked: number; execution: number; closeout: number };
    rows: WeeklyRow[];
  };
  actions?: ActionItem[];
};
type ViewerMode = 'leadership' | 'planning' | 'execution' | 'oversight' | 'general';
type ViewerContext = { mode?: ViewerMode; cargoName?: string | null; canEdit?: boolean; canCreateWorkOrder?: boolean; canCreateEmergencyWorkOrder?: boolean };
type Metric = readonly [string, string | number, string, string];

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'request failed');
  return payload as T;
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

function waitingAge(value?: string | null, locale: Locale = 'es') {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  const hours = Math.max(0, Math.floor((Date.now() - timestamp) / 3600000));
  if (hours < 24) return locale === 'en' ? `${hours}h waiting` : `esperando ${hours}h`;
  const days = Math.floor(hours / 24);
  return locale === 'en' ? `${days}d waiting` : `esperando ${days}d`;
}

type KindKey = 'approval_needed' | 'operational_review' | 'preventive_overdue' | 'assignment_needed' | 'meter_review' | 'operational_blocker' | 'plan_step' | 'ready_to_close' | 'closure_evidence' | 'reliability';

const kindMeta: Record<KindKey, { icon: typeof AlertTriangle; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  approval_needed: { icon: CheckCircle2, variant: 'secondary' },
  operational_review: { icon: AlertTriangle, variant: 'destructive' },
  preventive_overdue: { icon: Clock3, variant: 'destructive' },
  assignment_needed: { icon: Wrench, variant: 'outline' },
  meter_review: { icon: Gauge, variant: 'outline' },
  operational_blocker: { icon: ShieldAlert, variant: 'destructive' },
  plan_step: { icon: Wrench, variant: 'default' },
  ready_to_close: { icon: CheckCircle2, variant: 'secondary' },
  closure_evidence: { icon: AlertTriangle, variant: 'outline' },
  reliability: { icon: AlertTriangle, variant: 'outline' },
};

const kindFallback: KindKey = 'closure_evidence';

const maintenanceFlow = [
  { step: '01', flowKey: 'plan' as const, href: '/dashboard/planificacion' },
  { step: '02', flowKey: 'prepare' as const, href: '/dashboard/bodega' },
  { step: '03', flowKey: 'execute' as const, href: '/dashboard/mantenimiento/ordenes-trabajo' },
  { step: '04', flowKey: 'validate' as const, href: '/dashboard/mantenimiento/ordenes-trabajo/cierre' },
  { step: '05', flowKey: 'learn' as const, href: '/dashboard/mantenimiento/decision-intelligence' },
] as const;

const planningKinds = new Set(['approval_needed', 'operational_review', 'preventive_overdue', 'assignment_needed', 'meter_review', 'operational_blocker', 'plan_step', 'ready_to_close', 'closure_evidence']);
const leadershipKinds = new Set(['approval_needed', 'operational_review', 'preventive_overdue', 'assignment_needed', 'operational_blocker', 'plan_step', 'ready_to_close', 'closure_evidence', 'reliability']);
const oversightKinds = new Set(['operational_review', 'operational_blocker', 'reliability']);

type WorkMode = Exclude<ViewerMode, 'execution'>;

export function MaintenanceHome({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const t = dictionary.app.maintenance;
  const { data: viewer, isLoading: viewerLoading } = useSWR<ViewerContext>('/api/maintenance/viewer-context', (url) => fetcher<ViewerContext>(url), { revalidateOnFocus: false });
  const mode: ViewerMode = viewer?.mode || 'general';
  const { data, error, isLoading, mutate } = useSWR<Response>(viewer && mode !== 'execution' ? '/api/maintenance/control-center' : null, (url) => fetcher<Response>(url), { revalidateOnFocus: false });

  if (viewerLoading) {
    return <StatePanel tone="loading" title={t.loading} className="min-h-64 border-0 bg-transparent" />;
  }

  if (mode === 'execution') {
    return <div className="mx-auto w-full max-w-xl"><MobileTerrainPanel canCreateEmergencyWorkOrder={viewer?.canCreateEmergencyWorkOrder === true} /></div>;
  }

  const summary = data?.summary;
  const decisionOfDay = data?.decisionOfDay || null;
  const recentChanges = data?.recentChanges || [];
  const weeklyPlan = data?.weeklyPlan;
  const rawActions = data?.actions || [];
  const actions = mode === 'planning'
    ? rawActions.filter((action) => planningKinds.has(action.kind))
    : mode === 'leadership'
      ? rawActions.filter((action) => leadershipKinds.has(action.kind))
      : mode === 'oversight'
        ? rawActions.filter((action) => oversightKinds.has(action.kind))
        : rawActions;
  const supervisorInboxMode = mode === 'planning' || mode === 'leadership';
  const firstAssignment = mode === 'planning' ? actions.find((action) => action.kind === 'assignment_needed') : undefined;
  const firstLeadershipAction = mode === 'leadership' ? actions[0] : undefined;
  const firstOversightAction = mode === 'oversight' ? actions[0] : undefined;
  const preventiveGroupDetail = summary?.unplannedOverdueInterventionGroups != null
    ? fill(t.interventionCount, { n: summary.unplannedOverdueInterventionGroups })
    : t.toPlan;

  const ml = t.metricLabels;
  const md = t.metricDetails;
  const metricsByMode: Record<WorkMode, readonly Metric[]> = {
    leadership: [
      [ml.outOfService, summary?.outOfServiceOperationalReviews ?? '—', md.requireDecision, viewer?.canCreateWorkOrder ? '/dashboard/mantenimiento/ordenes-trabajo/create' : '/dashboard/mantenimiento/ordenes-trabajo'],
      [ml.preventivePending, summary?.unplannedOverdueHourSchedules ?? '—', preventiveGroupDetail, '/dashboard/mantenimiento/preventivo-horas'],
      [ml.openWorkOrders, summary?.openWorkOrders ?? '—', md.workInProgress, '/dashboard/mantenimiento/ordenes-trabajo'],
      [ml.blockers, summary?.operationallyBlocked ?? '—', md.unblock, '/dashboard/mantenimiento/ordenes-trabajo/cierre'],
    ],
    planning: [
      [ml.preventivePending, summary?.unplannedOverdueHourSchedules ?? '—', preventiveGroupDetail, '/dashboard/mantenimiento/preventivo-horas'],
      [ml.unassigned, summary?.unassignedOpenWorkOrders ?? '—', md.defineOwner, firstAssignment?.href || '/dashboard/mantenimiento/ordenes-trabajo'],
      [ml.outOfService, summary?.outOfServiceOperationalReviews ?? '—', md.defineResponse, '/dashboard/mantenimiento/ordenes-trabajo/create'],
      [ml.blockers, summary?.operationallyBlocked ?? '—', md.unblockBeforeExecution, '/dashboard/mantenimiento/ordenes-trabajo/cierre'],
    ],
    oversight: [
      [ml.outOfService, summary?.outOfServiceOperationalReviews ?? '—', md.operationalImpact, '/dashboard/mantenimiento/ordenes-trabajo'],
      [ml.openWorkOrders, summary?.openWorkOrders ?? '—', md.currentWork, '/dashboard/mantenimiento/ordenes-trabajo'],
      [ml.blockers, summary?.operationallyBlocked ?? '—', md.requireFollowUp, '/dashboard/mantenimiento/ordenes-trabajo/cierre'],
      [ml.recurrences, summary?.recurringReliabilityAssets ?? '—', md.repeatedSignals, '/dashboard/mantenimiento/confiabilidad'],
    ],
    general: [
      [ml.outOfService, summary?.outOfServiceOperationalReviews ?? '—', md.pendingHumanReview, '/dashboard/mantenimiento/ordenes-trabajo'],
      [ml.openWorkOrders, summary?.openWorkOrders ?? '—', md.currentWork, '/dashboard/mantenimiento/ordenes-trabajo'],
      [ml.blockers, summary?.operationallyBlocked ?? '—', md.requireFollowUp, '/dashboard/mantenimiento/ordenes-trabajo/cierre'],
    ],
  };
  const metrics = metricsByMode[mode as WorkMode];

  const titles = t.titles;
  const descriptions = t.descriptions;
  const pageTitle = mode === 'planning'
    ? titles.planning
    : mode === 'leadership'
      ? titles.leadership
      : mode === 'oversight'
        ? titles.oversight
        : titles.general;
  const pageDescription = mode === 'planning'
    ? descriptions.planning
    : mode === 'leadership'
      ? descriptions.leadership
      : mode === 'oversight'
        ? descriptions.oversight
        : descriptions.general;

  const visibleFlow = mode === 'planning'
    ? maintenanceFlow.slice(0, 3)
    : maintenanceFlow;
  const flowTitle = mode === 'planning'
    ? t.flow.titlePlanning
    : t.flow.titleFull;
  const flowDescription = mode === 'planning'
    ? t.flow.descriptionPlanning
    : t.flow.descriptionFull;
  const showOwnedFlow = mode === 'planning' || mode === 'leadership';
  const showArielCockpit = mode === 'planning' || mode === 'leadership';
  const cockpitCopy = locale === 'en'
    ? {
        title: 'Ariel cockpit',
        description: 'One view for what is scheduled, blocked, awaiting approval, and repeating.',
        items: [
          ['Today', summary?.scheduledToday ?? '—', 'Scheduled work orders', '/dashboard/mantenimiento/calendario'],
          ['This week', summary?.scheduledThisWeek ?? '—', 'Scheduled work orders', '/dashboard/mantenimiento/calendario'],
          ['Blockers', summary?.operationallyBlocked ?? '—', 'Prevent execution', '/dashboard/mantenimiento/eam'],
          ['Approve', summary?.pendingApprovals ?? '—', 'Completed work orders', '/dashboard/mantenimiento/ordenes-trabajo'],
          ['Learn', summary?.recurringReliabilityAssets ?? '—', 'Audited recurrences', '/dashboard/mantenimiento/confiabilidad'],
        ] as const,
      }
    : {
        title: 'Cockpit Ariel',
        description: 'Una vista para saber qué está programado, bloqueado, pendiente de aprobación y qué se está repitiendo.',
        items: [
          ['Hoy', summary?.scheduledToday ?? '—', 'OT programadas', '/dashboard/mantenimiento/calendario'],
          ['Esta semana', summary?.scheduledThisWeek ?? '—', 'OT programadas', '/dashboard/mantenimiento/calendario'],
          ['Bloqueos', summary?.operationallyBlocked ?? '—', 'Impiden ejecutar', '/dashboard/mantenimiento/eam'],
          ['Por aprobar', summary?.pendingApprovals ?? '—', 'OT terminadas', '/dashboard/mantenimiento/ordenes-trabajo'],
          ['Aprender', summary?.recurringReliabilityAssets ?? '—', 'Recurrencias auditadas', '/dashboard/mantenimiento/confiabilidad'],
        ] as const,
      };

  return <div className="mx-auto w-full max-w-[1600px] space-y-6">
    <div className="mb-2 flex flex-wrap justify-end gap-2">
      {(mode === 'planning' || mode === 'leadership' || mode === 'general') ? (
        <Link href="/dashboard/mantenimiento/eam" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          <Workflow className="h-4 w-4" /> Flujo EAM
        </Link>
      ) : null}
      {(mode === 'planning' || mode === 'leadership' || mode === 'general') ? (
        <Link href="/dashboard/mantenimiento/lubricacion" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">
          <Droplets className="h-4 w-4" /> Aceites y lubricación
        </Link>
      ) : null}
      <Link href="/dashboard/mantenimiento/calendario" className="inline-flex items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted">Calendario →</Link>
    </div>
      <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>{t.eyebrow}{viewer?.cargoName ? ` · ${viewer.cargoName}` : ` · ${t.transversalAccess}`}</PageHeaderEyebrow>
        <PageHeaderTitle>{pageTitle}</PageHeaderTitle>
        <PageHeaderDescription>{pageDescription}</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        {viewer?.canCreateWorkOrder
          ? <Button asChild><Link href="/dashboard/mantenimiento/ordenes-trabajo/create"><Wrench className="h-4 w-4" />Nueva OT</Link></Button>
          : mode === 'leadership' && firstLeadershipAction
            ? <Button asChild><Link href={firstLeadershipAction.href}><ArrowRight className="h-4 w-4" />{t.cta.attendPriority}</Link></Button>
            : mode === 'oversight'
              ? <Button asChild><Link href={firstOversightAction?.href || '/dashboard/mantenimiento/ordenes-trabajo'}><ArrowRight className="h-4 w-4" />{t.cta.reviewImpact}</Link></Button>
              : <Button asChild><Link href="/dashboard/mantenimiento/ordenes-trabajo"><ArrowRight className="h-4 w-4" />{t.cta.reviewOrders}</Link></Button>}
      </PageHeaderActions>
    </PageHeader>

    {showArielCockpit ? <section aria-labelledby="ariel-maintenance-cockpit" className="space-y-3">
      <div>
        <h2 id="ariel-maintenance-cockpit" className="text-lg font-semibold">{cockpitCopy.title}</h2>
        <p className="text-sm text-muted-foreground">{cockpitCopy.description}</p>
      </div>
      <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-5">
        {cockpitCopy.items.map(([label, value, detail, href]) => <Link key={label} href={href} className="bg-card p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="mt-2 flex items-end justify-between gap-3">
            <p className="text-3xl font-semibold tracking-tight tabular-nums">{isLoading ? '—' : value}</p>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
        </Link>)}
      </div>
    </section> : null}

    {showArielCockpit && decisionOfDay ? <Card className="shadow-none" aria-label="Decisión del día">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{locale === 'en' ? 'Decision of the day' : 'Decisión del día'}</p>
            <CardTitle className="mt-1 text-lg">{decisionOfDay.title}</CardTitle>
            <CardDescription className="mt-1">{decisionOfDay.description}</CardDescription>
          </div>
          {waitingAge(decisionOfDay.waitingSince, locale) ? <Badge variant="outline">{waitingAge(decisionOfDay.waitingSince, locale)}</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="space-y-2 text-sm">
          <p><span className="font-medium">{locale === 'en' ? 'Evidence:' : 'Evidencia:'}</span> <span className="text-muted-foreground">{decisionOfDay.evidence}</span></p>
          {decisionOfDay.autopilot ? <>
            <p><span className="font-medium">{locale === 'en' ? 'MOTIL prepares:' : 'MOTIL prepara:'}</span> <span className="text-muted-foreground">{decisionOfDay.autopilot.preparedAction}</span></p>
            <p><span className="font-medium">{locale === 'en' ? 'Ariel decides:' : 'Ariel decide:'}</span> <span className="text-muted-foreground">{decisionOfDay.autopilot.authority}</span></p>
          </> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {decisionOfDay.assetHref ? <Button asChild variant="outline"><Link href={decisionOfDay.assetHref}>{locale === 'en' ? 'View asset' : 'Ver activo'}</Link></Button> : null}
          <Button asChild><Link href={decisionOfDay.href}>{locale === 'en' ? 'Resolve now' : 'Resolver ahora'}<ArrowRight className="h-4 w-4"/></Link></Button>
        </div>
      </CardContent>
    </Card> : null}

    {showArielCockpit ? <div className="grid gap-4 xl:grid-cols-2">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{locale === 'en' ? 'What changed since yesterday' : 'Qué cambió desde ayer'}</CardTitle>
          <CardDescription>{locale === 'en' ? 'Only timestamped operational events. No inferred changes.' : 'Sólo eventos operacionales con timestamp explícito. Sin cambios inferidos.'}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recentChanges.length === 0 ? <p className="px-5 pb-5 text-sm text-muted-foreground">{locale === 'en' ? 'No timestamped changes to report.' : 'Sin cambios trazables que reportar.'}</p> : <div className="divide-y">{recentChanges.slice(0, 5).map((change) => <Link key={`${change.kind}-${change.occurredAt}-${change.href}`} href={change.href} className="flex items-center justify-between gap-3 px-5 py-3 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><div className="min-w-0"><p className="truncate text-sm font-medium">{change.title}</p><p className="truncate text-xs text-muted-foreground">{change.detail}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground"/></Link>)}</div>}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="text-base">{locale === 'en' ? 'Weekly plan' : 'Plan semanal'}</CardTitle>
          <CardDescription>{locale === 'en' ? 'The same scheduled work, reduced to four operational states.' : 'Las mismas OT programadas, reducidas a cuatro estados operacionales.'}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-4">
            {[
              [locale === 'en' ? 'Ready' : 'Preparadas', weeklyPlan?.summary.prepared ?? '—'],
              [locale === 'en' ? 'Blocked' : 'Bloqueadas', weeklyPlan?.summary.blocked ?? '—'],
              [locale === 'en' ? 'Running' : 'Ejecutando', weeklyPlan?.summary.execution ?? '—'],
              [locale === 'en' ? 'Close' : 'Por cerrar', weeklyPlan?.summary.closeout ?? '—'],
            ].map(([label, value]) => <div key={String(label)} className="bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{isLoading ? '—' : value}</p></div>)}
          </div>
          {(weeklyPlan?.rows || []).slice(0, 4).map((row) => <Link key={row.id} href={row.href} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"><div className="min-w-0"><p className="truncate text-sm font-medium">{row.workOrderNumber || 'OT'} · {row.title || (locale === 'en' ? 'Work order' : 'Orden de trabajo')}</p><p className="truncate text-xs text-muted-foreground">{[row.scheduledDate, row.assignedToName].filter(Boolean).join(' · ') || (locale === 'en' ? 'Context pending' : 'Contexto pendiente')}</p></div><Badge variant={row.bucket === 'blocked' ? 'destructive' : 'outline'}>{row.bucket === 'prepared' ? (locale === 'en' ? 'Ready' : 'Preparada') : row.bucket === 'blocked' ? (locale === 'en' ? 'Blocked' : 'Bloqueada') : row.bucket === 'execution' ? (locale === 'en' ? 'Running' : 'Ejecutando') : (locale === 'en' ? 'Close' : 'Por cerrar')}</Badge></Link>)}
          <Button asChild variant="outline" className="w-full"><Link href="/dashboard/mantenimiento/calendario">{locale === 'en' ? 'Open full calendar' : 'Abrir calendario completo'}</Link></Button>
        </CardContent>
      </Card>
    </div> : null}

    <WhatsappOperationalUpdates mode="maintenance"/>
    <p className="text-sm text-muted-foreground">Primero mostramos lo que necesita atención. Abre una acción para continuar.</p>
    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="text-lg">{t.queue.titles[mode as WorkMode]}</CardTitle><CardDescription>{t.queue.descriptions[mode as WorkMode]}</CardDescription></div>{!isLoading && !error ? <Badge variant="outline">{fill(t.queue.actionsBadge, { n: actions.length })}</Badge> : null}</CardHeader>
      <CardContent>
        {isLoading ? <StatePanel tone="loading" title={t.queue.loading} className="min-h-64 border-0 bg-transparent" /> : !error && actions.length === 0 ? <StatePanel tone="neutral" title={t.queue.emptyTitle} description={t.queue.emptyDescriptions[mode as WorkMode]} className="min-h-64 border-0 bg-transparent" /> : !error ? <div className="divide-y rounded-lg border">{actions.map((action, index) => {
          const kindKey = (action.kind in kindMeta ? action.kind : kindFallback) as KindKey;
          const meta = kindMeta[kindKey];
          const Icon = meta.icon;
          return <div key={action.id} className="grid gap-3 p-4 md:grid-cols-[40px_1fr_auto] md:items-center"><div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background"><Icon className="h-4 w-4" /></div><div className="min-w-0"><Link href={action.href} className="flex flex-wrap items-center gap-2 rounded-sm outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"><span className="text-xs tabular-nums text-muted-foreground">#{index + 1}</span><Badge variant={meta.variant}>{t.kinds[kindKey]}</Badge><p className="font-medium">{action.title}</p></Link><details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer select-none font-medium text-foreground/80">Ver detalle</summary><div className="mt-2 space-y-1 border-l border-border pl-3"><p>{action.description}</p><p>{fill(t.evidenceLabel, { text: action.evidence })}</p>{action.autopilot ? <><p><span className="font-medium text-foreground">MOTIL prepara:</span> {action.autopilot.preparedAction}</p><p><span className="font-medium text-foreground">Debe decidir:</span> {action.autopilot.authority}</p></> : null}</div></details></div><Button asChild variant="ghost" size="icon-sm" aria-label={t.openActionAria}><Link href={action.href}><ArrowRight className="h-4 w-4" /></Link></Button></div>;
        })}</div> : null}
      </CardContent>
    </Card>

    <details data-testid="maintenance-more-details" className="rounded-lg border bg-card">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">Ver más</summary>
      <div className="space-y-6 border-t p-4">
        <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className="mr-2 h-4 w-4" />{t.refresh}</Button>


    {!supervisorInboxMode ? <section aria-label={t.metricsAria} className={`grid gap-3 sm:grid-cols-2 ${metrics.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
      {metrics.map(([label, value, detail, href]) => <Link key={label} href={href} className="rounded-lg border bg-card px-4 py-4 shadow-none outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-2 flex items-end justify-between gap-3"><p className="text-3xl font-semibold tracking-tight">{isLoading ? '—' : value}</p><p className="text-right text-xs text-muted-foreground">{detail}</p></div></Link>)}
    </section> : null}

    {!supervisorInboxMode && showOwnedFlow ? <section aria-labelledby="maintenance-flow-title" className="border-y border-border py-4">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.flow.label}</p>
          <h2 id="maintenance-flow-title" className="text-lg font-semibold">{flowTitle}</h2>
        </div>
        <p className="max-w-xl text-sm text-muted-foreground">{flowDescription}</p>
      </div>
      <div className={`grid divide-y border border-border bg-card ${mode === 'planning' ? 'md:grid-cols-3' : 'md:grid-cols-5'} md:divide-x md:divide-y-0`}>
        {visibleFlow.map((item, index) => <Link key={item.step} href={item.href} className="group min-w-0 px-4 py-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <div className="flex items-center justify-between gap-3"><span className="text-xs tabular-nums text-muted-foreground">{item.step}</span><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
          <p className="mt-3 font-medium">{t.flow.steps[index].label}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{t.flow.steps[index].detail}</p>
        </Link>)}
      </div>
      {mode === 'leadership' ? <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <span>{t.flow.handoffProduction}</span><span>·</span><span>{t.flow.handoffWarehouse}</span><span>·</span><Link className="hover:text-foreground" href="/dashboard/compras">{t.flow.handoffProcurement}</Link><span>·</span><span>{t.flow.handoffFinance}</span>
      </div> : null}
    </section> : null}

    {!supervisorInboxMode ? <CanonicalMaintenanceOverview /> : null}

    {!supervisorInboxMode && !isLoading && !error && summary ? <AutopilotDecisionStrip
      locale={locale}
      decisionCount={actions.length}
      blockerCount={summary.operationallyBlocked || 0}
      readyToCloseCount={summary.readyToClose || 0}
      firstActionHref={actions[0]?.href || '/dashboard/mantenimiento/ordenes-trabajo'}
    /> : null}

    {!supervisorInboxMode && !isLoading && !error && Number(summary?.outOfServiceOperationalReviews || 0) > 0 ? <StatePanel tone="warning" title={fill(t.outOfServiceWarning.title, { n: summary?.outOfServiceOperationalReviews || 0 })} description={t.outOfServiceWarning.description} className="min-h-0 py-5" /> : null}

    {error ? <StatePanel tone="error" title={t.error.title} description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>{t.error.retry}</Button>} className="min-h-0 py-5" /> : null}

    <div className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-sm text-muted-foreground" aria-label={t.relatedAria}>
      {mode === 'planning' ? <>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/preventivo-horas">{t.related.preventiveHours}</Link>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/horometros">{t.related.hourMeters}</Link>
      </> : mode === 'oversight' ? <>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/ordenes-trabajo">{t.related.workOrders}</Link>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/confiabilidad">{t.related.reliability}</Link>
      </> : mode === 'general' ? <>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/ordenes-trabajo">{t.related.workOrders}</Link>
      </> : <>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/data-readiness">{t.related.dataQuality}</Link>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/decision-intelligence">{t.related.decisionIntelligence}</Link>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/preventivo-horas">{t.related.preventiveHours}</Link>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/confiabilidad">{t.related.reliability}</Link>
        <Link className="hover:text-foreground" href="/dashboard/mantenimiento/horometros">{t.related.hourMeters}</Link>
      </>}
    </div>
      </div>
    </details>
  </div>;
}
