'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Drill, Factory, Gauge, Inbox, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { HomeDecisionPriorities } from '@/components/dashboard/home-decision-priorities';
import { FinanceRoleHome } from '@/components/dashboard/finance-role-home';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';

type RoleTask = {
  task_key: string;
  domain: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  evidence_summary: string | null;
  responsibility: 'owner' | 'support' | 'escalation';
  module_route: string;
  urgency_label?: string | null;
};

type InboxSummary = { total: number; owners: number; support: number; escalations: number; critical: number; overdue: number; backlog: number };
type InboxPayload = {
  profile?: { name?: string | null; cargoId?: string | null; cargoName?: string | null };
  summary?: InboxSummary;
  tasks?: RoleTask[];
};

type ProductionOverview = {
  counts?: { drillingReports?: number; drillingHoles?: number };
  quality?: { status?: 'PASS' | 'HOLD'; pass?: number; hold?: number };
  coverage?: {
    queue?: { importExceptions?: number };
    domains?: {
      plant?: { status?: string; evidenceCount?: number; reviewCount?: number };
      drilling?: { status?: string; evidenceCount?: number; reviewCount?: number };
    };
  };
  currentPeriod?: null | {
    treatedTons?: number;
    avgHeadGradePct?: number | null;
    avgRecoveryPct?: number | null;
    plan?: null | { treatmentProgressPct?: number | null; paceIndexPct?: number | null };
  };
};

type MaintenanceOverview = {
  overview?: {
    total: number;
    planned: number;
    in_progress: number;
    waiting_procurement: number;
    waiting_parts: number;
    missing_asset: number;
    missing_person: number;
    completed: number;
  };
};

type HomeMode = 'mine' | 'engineering' | 'plant' | 'maintenance' | 'drilling' | 'inventory' | 'sustainability' | 'finance' | 'management' | 'general';
type Metric = { label: string; value: string | number; detail?: string };
type Shortcut = { label: string; href: string; detail: string };

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'request failed');
  return payload;
};

const optionalFetcher = async (url: string) => {
  try {
    return await fetcher(url);
  } catch {
    return null;
  }
};

function normalize(value: string | null | undefined) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function resolveMode(cargoName: string | null | undefined): HomeMode {
  const cargo = normalize(cargoName);
  if (/jefe ing.*pla mina|jefe.*ingenier.*planific/.test(cargo)) return 'engineering';
  if (/jefe mina peumo|jefe mina don jaime/.test(cargo)) return 'mine';
  if (/todos los cargos|gerenc|director|administrador|admin|jefatura general/.test(cargo)) return 'management';
  if (/sostenibilidad|prevencion|hse|medio ambiente/.test(cargo)) return 'sustainability';
  if (/jefe adm|administracion|finanzas|financiero/.test(cargo)) return 'finance';
  if (/mantencion|mantenimiento|mecan|taller|jefe man\.? eq|jefe mant|planificador.*mant/.test(cargo)) return 'maintenance';
  if (/sondaje|perforacion|perforista/.test(cargo)) return 'drilling';
  if (/jefe.*planta|planta.*jefe|metalurg/.test(cargo)) return 'plant';
  if (/bodega|inventario|almacen/.test(cargo)) return 'inventory';
  return 'general';
}

/* Shortcut hrefs are identifiers, not copy: they stay in code, keyed. */
const SHORTCUT_HREFS: Record<string, string> = {
  productionIntel: '/dashboard/produccion/inteligencia',
  plantMetallurgy: '/dashboard/produccion/planta-metalurgia',
  maintenanceIntel: '/dashboard/mantenimiento/inteligencia',
  availability: '/dashboard/mantenimiento/disponibilidad',
  workOrders: '/dashboard/mantenimiento/ordenes-trabajo',
  drilling: '/dashboard/produccion/sondaje',
  equipment: '/dashboard/mantenimiento/equipos',
  warehouseIntel: '/dashboard/bodega/inteligencia',
  warehouse: '/dashboard/bodega',
  sustainability: '/dashboard/sostenibilidad',
  nonConformities: '/dashboard/sostenibilidad/no-conformidades',
  finance: '/dashboard/finanzas',
  costCenters: '/dashboard/finanzas/centros',
  executiveCenter: '/dashboard/decisiones',
  dataHealth: '/dashboard/calidad-datos/salud',
  actions: '/dashboard/acciones',
  production: '/dashboard/produccion',
  maintenance: '/dashboard/mantenimiento',
};

const fill = (template: string, value: string | number) => template.replace('{n}', String(value));

function configFor(
  mode: HomeMode,
  production: ProductionOverview | null | undefined,
  maintenance: MaintenanceOverview | null | undefined,
  inbox: InboxPayload | null | undefined,
  t: Dictionary['app']['home'],
  locale: Locale,
): { eyebrow: string; title: string; description: string; metrics: Metric[]; shortcuts: Shortcut[] } {
  const p = production?.currentPeriod;
  const queue = production?.coverage?.queue;
  const drill = production?.coverage?.domains?.drilling;
  const m = maintenance?.overview;
  const summary = inbox?.summary;
  const numberLocale = locale === 'en' ? 'en-US' : 'es-CL';

  const n = (value: number | null | undefined, digits = 0) => value == null ? '—' : value.toLocaleString(numberLocale, { maximumFractionDigits: digits });
  const pct = (value: number | null | undefined, digits = 1) => value == null ? '—' : `${n(value, digits)}%`;
  const tons = (value: number | null | undefined, digits = 0) => value == null ? '—' : `${n(value, digits)} t`;
  const roleValue = (key: keyof InboxSummary) => summary ? summary[key] : '—';
  const overdueDetail = (template: string) => summary ? fill(template, summary.overdue) : t.actionsSourceUnavailable;

  const shortcutsFor = (modeCfg: { shortcuts: readonly { key: string; label: string; detail: string }[] }) =>
    modeCfg.shortcuts.map((item) => ({ label: item.label, href: SHORTCUT_HREFS[item.key] ?? '/dashboard', detail: item.detail }));

  if (mode === 'engineering') {
    return {
      eyebrow: 'INGENIERÍA Y PLANIFICACIÓN',
      title: 'Planificación minera',
      description: 'Revisa el avance, las restricciones y las decisiones pendientes. Los datos sin verificar no se presentan como cumplimiento.',
      metrics: [],
      shortcuts: [
        { label: 'Topografía y plan', href: '/dashboard/produccion/topografia', detail: 'Revisa vigencia del plan, objetivos y evidencia disponible.' },
        { label: 'Tareas del cargo', href: '/dashboard/acciones', detail: 'Revisa responsabilidades y escalaciones registradas.' },
      ],
    };
  }

  if (mode === 'mine') {
    return {
      eyebrow: 'JEFATURA DE MINA',
      title: inbox?.profile?.cargoName?.toUpperCase().includes('PEUMO') ? 'Operación · Peumo' : 'Operación · Don Jaime',
      description: 'Prioriza novedades, equipos y órdenes de trabajo. Las acciones se validan según tus permisos.',
      metrics: [],
      shortcuts: [
        { label: 'Órdenes de trabajo', href: '/dashboard/mantenimiento/ordenes-trabajo', detail: 'Crea o da seguimiento a solicitudes autorizadas.' },
        { label: 'Equipos', href: '/dashboard/mantenimiento/equipos', detail: 'Consulta equipos y condiciones registradas.' },
        { label: 'Tareas y novedades', href: '/dashboard/acciones', detail: 'Atiende lo que requiere tu decisión.' },
        { label: 'Producción', href: '/dashboard/produccion', detail: 'Consulta el avance operacional disponible.' },
      ],
    };
  }

  if (mode === 'plant') {
    const cfg = t.modes.plant;
    const [mt, mp, mg, mc] = cfg.metrics;
    return {
      eyebrow: cfg.eyebrow, title: cfg.title, description: cfg.description,
      metrics: [
        { label: mt.label, value: tons(p?.treatedTons, 1), detail: p?.plan ? fill(mt.withPlan, pct(p.plan.treatmentProgressPct)) : production ? mt.noPlan : mt.unavailable },
        { label: mp.label, value: pct(p?.plan?.paceIndexPct), detail: mp.detail },
        { label: mg.label, value: pct(p?.avgHeadGradePct, 3), detail: mg.detail },
        { label: mc.label, value: roleValue('critical'), detail: overdueDetail(mc.detail) },
      ],
      shortcuts: shortcutsFor(cfg),
    };
  }

  if (mode === 'maintenance') {
    const cfg = t.modes.maintenance;
    const [ma, mw, mx, mc] = cfg.metrics;
    const active = m ? Math.max(0, m.total - m.completed) : null;
    return {
      eyebrow: cfg.eyebrow, title: cfg.title, description: cfg.description,
      metrics: [
        { label: ma.label, value: active ?? '—', detail: m ? fill(ma.detail, m.in_progress) : ma.unavailable },
        { label: mw.label, value: m ? m.waiting_procurement + m.waiting_parts : '—', detail: mw.detail },
        { label: mx.label, value: m?.missing_asset ?? '—', detail: mx.detail },
        { label: mc.label, value: roleValue('critical'), detail: overdueDetail(mc.detail) },
      ],
      shortcuts: shortcutsFor(cfg),
    };
  }

  if (mode === 'drilling') {
    const cfg = t.modes.drilling;
    const [mr, mh, mv, mc] = cfg.metrics;
    return {
      eyebrow: cfg.eyebrow, title: cfg.title, description: cfg.description,
      metrics: [
        { label: mr.label, value: production?.counts?.drillingReports ?? '—', detail: mr.detail },
        { label: mh.label, value: production?.counts?.drillingHoles ?? '—', detail: mh.detail },
        { label: mv.label, value: drill?.reviewCount ?? '—', detail: mv.detail },
        { label: mc.label, value: roleValue('critical'), detail: overdueDetail(mc.detail) },
      ],
      shortcuts: shortcutsFor(cfg),
    };
  }

  const roleMetrics: Metric[] = t.roleMetrics.map((metric, index) => {
    const keys: (keyof InboxSummary)[] = ['owners', 'critical', 'escalations', 'backlog'];
    const value = roleValue(keys[index]);
    const detail = metric.detail.includes('{n}') ? overdueDetail(metric.detail) : metric.detail;
    return { label: metric.label, value, detail };
  });

  if (mode === 'inventory') {
    const cfg = t.modes.inventory;
    return { eyebrow: cfg.eyebrow, title: cfg.title, description: cfg.description, metrics: roleMetrics, shortcuts: shortcutsFor(cfg) };
  }

  if (mode === 'sustainability') {
    const cfg = t.modes.sustainability;
    return { eyebrow: cfg.eyebrow, title: cfg.title, description: cfg.description, metrics: roleMetrics, shortcuts: shortcutsFor(cfg) };
  }

  if (mode === 'finance') {
    const cfg = t.modes.finance;
    return { eyebrow: cfg.eyebrow, title: cfg.title, description: cfg.description, metrics: roleMetrics, shortcuts: shortcutsFor(cfg) };
  }

  if (mode === 'management') {
    const cfg = t.modes.management;
    const [mc, me, mi, mq] = cfg.metrics;
    return {
      eyebrow: cfg.eyebrow, title: cfg.title, description: cfg.description,
      metrics: [
        { label: mc.label, value: roleValue('critical'), detail: overdueDetail(mc.detail) },
        { label: me.label, value: roleValue('escalations'), detail: me.detail },
        { label: mi.label, value: queue?.importExceptions ?? '—', detail: mi.detail },
        { label: mq.label, value: production?.quality?.status ?? '—', detail: production?.quality ? fill(mq.detail, production.quality.hold ?? 0) : mq.unavailable },
      ],
      shortcuts: shortcutsFor(cfg),
    };
  }

  const cfg = t.modes.general;
  const keys: (keyof InboxSummary)[] = ['owners', 'critical', 'overdue', 'escalations'];
  return {
    eyebrow: cfg.eyebrow, title: cfg.title, description: cfg.description,
    metrics: cfg.metrics.map((metric, index) => ({ label: metric.label, value: roleValue(keys[index]) })),
    shortcuts: shortcutsFor(cfg),
  };
}

export function DashboardHome({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const t = dictionary.app.home;
  const inbox = useSWR<InboxPayload>('/api/actions/inbox', fetcher, { refreshInterval: 60000, revalidateOnFocus: false });
  const mode = resolveMode(inbox.data?.profile?.cargoName);
  const [moreOpen, setMoreOpen] = useState(false);
  // Area-scoped cargos should not read unrelated global operational summaries.
  const needsBroadData = moreOpen && Boolean(inbox.data) && mode !== 'engineering' && mode !== 'mine';
  const production = useSWR<ProductionOverview | null>(needsBroadData ? '/api/produccion/canonical-overview' : null, optionalFetcher, { revalidateOnFocus: false });
  const maintenance = useSWR<MaintenanceOverview | null>(needsBroadData ? '/api/maintenance/work-order-flow?limit=200' : null, optionalFetcher, { revalidateOnFocus: false });

  if (mode === 'finance' && inbox.data) {
    return <FinanceRoleHome name={inbox.data.profile?.name} summary={inbox.data.summary} />;
  }

  const config = configFor(mode, production.data, maintenance.data, inbox.data, t, locale);
  const tasks = (inbox.data?.tasks || []).slice(0, 5);
  const loading = inbox.isLoading;
  const inboxUnavailable = Boolean(inbox.error) || (!loading && !inbox.data);

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>{config.eyebrow}</PageHeaderEyebrow>
          <PageHeaderTitle>{inbox.data?.profile?.name ? `Mi trabajo · ${inbox.data.profile.name}` : 'Mi trabajo'}</PageHeaderTitle>
          <PageHeaderDescription>Revisa lo que requiere tu atención. Los indicadores y accesos adicionales están en Ver más.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button asChild><Link href="/dashboard/acciones"><Inbox className="h-4 w-4" />{t.actions}</Link></Button>
        </PageHeaderActions>
      </PageHeader>

      {inboxUnavailable ? <StatePanel tone="warning" title={t.roleUnresolvedTitle} description={t.roleUnresolvedDescription} /> : null}

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div><h2 className="text-lg font-semibold">{mode === 'management' ? t.pendingTitle : t.attentionTitle}</h2><p className="text-sm text-muted-foreground">{mode === 'management' ? t.pendingSubtitle : t.attentionSubtitle}</p></div>
          {!inboxUnavailable && (inbox.data?.summary?.critical || 0) > 0 ? <Badge variant="destructive">{fill(t.criticalCount, inbox.data?.summary?.critical || 0)}</Badge> : null}
        </div>

        {loading ? <StatePanel tone="loading" title={t.loadingTitle} />
          : inboxUnavailable ? <StatePanel tone="warning" title={t.workUnavailableTitle} description={t.workUnavailableDescription} />
          : tasks.length === 0 ? <div className="flex items-center gap-3 rounded-lg border px-4 py-4">{mode==='engineering'?<AlertTriangle className="h-5 w-5 text-muted-foreground" />:<CheckCircle2 className="h-5 w-5 text-muted-foreground" />}<div><p className="text-sm font-medium">{mode==='engineering'?'Sin tareas registradas en Ingeniería':t.emptyTitle}</p><p className="text-xs text-muted-foreground">{mode==='engineering'?'La bandeja vacía no acredita cumplimiento del plan ni ausencia de brechas técnicas. Consulta Topografía.':t.emptyDescription}</p></div></div>
          : <div className="overflow-hidden rounded-lg border bg-card">{tasks.map((task) => <Link key={task.task_key} href={task.module_route || '/dashboard/acciones'} className="group flex items-center gap-4 border-b px-4 py-3 last:border-0 hover:bg-muted/30"><AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-sm font-medium">{task.title}</p>{task.severity === 'critical' ? <Badge variant="destructive">{t.criticalBadge}</Badge> : null}</div><p className="truncate text-xs text-muted-foreground">{task.evidence_summary || task.urgency_label || task.domain}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></Link>)}</div>}
      </section>

      <details className="group rounded-lg border bg-card" data-testid="dashboard-more-details" onToggle={(event) => setMoreOpen(event.currentTarget.open)}>
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          Ver más · Indicadores y accesos
        </summary>
        <div className="space-y-6 border-t p-4">
          <div>
            <h2 className="text-base font-semibold">{config.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
          </div>
      {config.metrics.length > 0 ? <section aria-label={t.indicatorsLabel} className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {config.metrics.map((metric) => (
          <div key={metric.label} className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">{metric.label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{loading ? '—' : metric.value}</p>
            {metric.detail ? <p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p> : null}
          </div>
        ))}
      </section> : null}

      {mode === 'management' ? <HomeDecisionPriorities dictionary={dictionary} locale={locale} /> : null}

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">{t.shortcutsTitle}</h2><p className="text-sm text-muted-foreground">{t.shortcutsSubtitle}</p></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {config.shortcuts.map((item) => {
            const Icon = item.href.includes('mantenimiento') ? Wrench : item.href.includes('sondaje') ? Drill : item.href.includes('produccion') ? Factory : Gauge;
            return <Link key={item.href} href={item.href} className="group rounded-lg border bg-card p-4 hover:bg-muted/30"><div className="flex items-start gap-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-md border bg-background"><Icon className="h-4 w-4" /></div><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.label}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p></div><ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div></Link>;
          })}
        </div>
      </section>
        </div>
      </details>
    </div>
  );
}
