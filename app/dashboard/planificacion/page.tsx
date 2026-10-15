'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, Boxes, CalendarClock, Factory, RefreshCw, Wrench } from 'lucide-react';
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

type ArielPriority = {
  source_row_id: string;
  canonical_asset_id: string;
  asset_code: string | null;
  asset_name: string | null;
  mine_raw: string | null;
  meter_unit: string | null;
  current_reading: number | null;
  remaining_meter: number | null;
  projected_days: number | null;
  criticality_raw: string | null;
  total_score: number | null;
  priority: string | null;
  recommended_action: string | null;
  scheduled_date: string | null;
  programming_status_raw: string | null;
  responsible_raw: string | null;
  parts_status_raw: string | null;
};

type PlanningResponse = {
  planner?: { name: string; role: string; scope: string[] };
  summary?: {
    active_alerts: number;
    critical_alerts: number;
    warning_alerts: number;
    material_blockers: number;
    maintenance_alerts: number;
    max_priority: number | null;
  } | null;
  attention?: Array<{
    domain: string | null;
    alert_key: string;
    severity: string | null;
    priority_score: number | null;
    title: string;
    evidence_summary: string | null;
    status: string | null;
    affects_operation: boolean | null;
    material_related: boolean | null;
    occurred_at: string | null;
    recommended_action: string | null;
    action_url: string;
  }>;
  preventive?: Array<{
    schedule_id: string;
    canonical_asset_id: string | null;
    asset_code: string | null;
    asset_name: string | null;
    task_name: string | null;
    remaining_hours: number | null;
    meter_basis_conflict: boolean | null;
  }>;
  arielPlanning?: {
    sourceCoverage: { total_rows: number; matched_rows: number; unmatched_rows: number; matched_percent: number };
    priorityCounts: Record<string, number>;
    priorities: ArielPriority[];
    semantics: { source: string; priority: string; authority: string };
  };
  productionPlan?: {
    id: string;
    plan_code: string;
    period_start: string;
    period_end: string;
    status: string;
    total_mineral_to_plant_tons: number | null;
    total_movement_tons: number | null;
    planned_advance_m: number | null;
    planned_drilling_m: number | null;
  } | null;
  sourceStatus?: Record<string, { available: boolean }> & { complete: boolean };
};

const fetcher = async (url: string): Promise<PlanningResponse> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar el centro de planificación');
  return payload || {};
};

function number(value: number | null | undefined, suffix = '') {
  if (value == null || Number.isNaN(Number(value))) return '—';
  return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Number(value))}${suffix}`;
}

function priorityVariant(priority: string | null): 'destructive' | 'outline' | 'secondary' {
  if (priority?.startsWith('P1')) return 'destructive';
  if (priority?.startsWith('P2')) return 'secondary';
  return 'outline';
}

function domainLabel(domain: string | null) {
  const value = String(domain || '').toLowerCase();
  if (value.includes('maintenance')) return 'Mantenimiento';
  if (value.includes('inventory') || value.includes('warehouse') || value.includes('material')) return 'Bodega';
  if (value.includes('purchase') || value.includes('procurement')) return 'Compras';
  if (value.includes('production') || value.includes('drilling')) return 'Producción';
  return 'Transversal';
}

export default function PlanificacionPage() {
  const { data: maintenanceViewer } = useSWR<{ canCreateWorkOrder?: boolean }>(
    '/api/maintenance/viewer-context',
    async (url: string) => {
      const response = await fetch(url, { credentials: 'include' });
      return response.ok ? (await response.json()) as { canCreateWorkOrder?: boolean } : { canCreateWorkOrder: false };
    },
    { revalidateOnFocus: false },
  );
  const { data, error, isLoading, isValidating, mutate } = useSWR<PlanningResponse>('/api/planificacion', fetcher, { revalidateOnFocus: false });
  const attention = data?.attention ?? [];
  const preventive = data?.preventive ?? [];
  const plan = data?.productionPlan ?? null;
  const summary = data?.summary ?? null;
  const ariel = data?.arielPlanning;
  const priorities = ariel?.priorities ?? [];
  const complete = data?.sourceStatus?.complete === true;

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Planificación</PageHeaderEyebrow>
          <PageHeaderTitle>Qué necesita atención</PageHeaderTitle>
          <PageHeaderDescription>
            Prioridades, bloqueos y plan activo. MOTIL calcula; Ariel valida y programa.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          {maintenanceViewer?.canCreateWorkOrder ? (
            <Button asChild><Link href="/dashboard/mantenimiento/ordenes-trabajo/create"><Wrench className="h-4 w-4" />Programar OT</Link></Button>
          ) : null}
          <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}>
            <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </PageHeaderActions>
      </PageHeader>

      {!complete && data?.sourceStatus ? (
        <StatePanel tone="warning" title="Vista parcial de planificación" description="Una o más fuentes no respondieron. Los datos disponibles se mantienen visibles y la ausencia no se interpreta como cero." className="min-h-0" />
      ) : null}



      {isLoading ? <StatePanel tone="loading" title="Construyendo la vista de planificación" description="Consultando plan maestro, atención operacional, mantenimiento preventivo y producción." /> : null}
      {error ? <StatePanel tone="error" title="No fue posible cargar planificación" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} /> : null}

      {!isLoading && !error ? (
        <>
          <section className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Plan maestro Ariel</p>
              <h2 className="mt-1 text-lg font-semibold">Qué va primero</h2>
              <p className="mt-1 text-sm text-muted-foreground">Equipos reconciliados, ordenados por prioridad. Los no reconciliados quedan fuera de la cola.</p>
            </div>
            {priorities.length ? (
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                <div className="divide-y divide-border">
                  {priorities.slice(0, 12).map((item) => (
                    <article key={item.source_row_id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between lg:px-5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{item.asset_code || item.asset_name || 'Equipo'}</h3>
                          <Badge variant={priorityVariant(item.priority)}>{item.priority || 'Sin clasificar'}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{item.recommended_action || 'Revisar prioridad y programación'}</p>
                        <details className="mt-2 text-xs text-muted-foreground">
                          <summary className="w-fit cursor-pointer font-medium">Ver detalles</summary>
                          <dl className="mt-2 grid gap-2 rounded-md border p-3 sm:grid-cols-3">
                            <div><dt>Lectura</dt><dd className="font-medium text-foreground">{number(item.current_reading, item.meter_unit ? ` ${item.meter_unit}` : '')}</dd></div>
                            <div><dt>Saldo</dt><dd className="font-medium text-foreground">{number(item.remaining_meter, item.meter_unit ? ` ${item.meter_unit}` : '')}</dd></div>
                            <div><dt>Proyección</dt><dd className="font-medium text-foreground">{number(item.projected_days, ' días')}</dd></div>
                            <div className="sm:col-span-3">{item.mine_raw || 'Sin mina'} · Criticidad {item.criticality_raw || 'sin validar'}</div>
                          </dl>
                        </details>
                      </div>
                      <Button size="sm" variant="outline" asChild><Link href="/dashboard/mantenimiento/planificacion">Revisar</Link></Button>
                    </article>
                  ))}
                </div>
              </div>
            ) : <StatePanel tone="neutral" title="Sin equipos reconciliados para priorizar" description="La fuente de Ariel permanece como evidencia hasta que exista correspondencia segura con un activo canónico." />}
          </section>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
            <section className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Coordinación</p>
                <h2 className="mt-1 text-lg font-semibold">Qué está bloqueando</h2>
                <p className="mt-1 text-sm text-muted-foreground">Señales de mantenimiento, bodega, compras y producción que requieren revisión.</p>
              </div>
              {attention.length === 0 ? <StatePanel tone="neutral" title="Sin señales pendientes" description="No se generan decisiones automáticas por ausencia de señales." /> : (
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="divide-y divide-border">
                    {attention.slice(0, 10).map((item) => (
                      <article key={item.alert_key} className="grid gap-4 px-4 py-4 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center lg:px-5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                          {item.material_related ? <Boxes className="h-4 w-4 text-muted-foreground" /> : item.domain?.includes('maintenance') ? <Wrench className="h-4 w-4 text-muted-foreground" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{item.title}</h3><Badge variant="outline">{domainLabel(item.domain)}</Badge></div>
                          {item.evidence_summary ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.evidence_summary}</p> : null}
                        </div>
                        <Button size="sm" variant="outline" asChild><Link href={item.action_url}>Abrir fuente</Link></Button>
                      </article>
                    ))}
                  </div>
                </div>
              )}
            </section>

            <aside className="space-y-6">
              <section className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Producción</p><h2 className="mt-1 text-base font-semibold">Plan activo</h2></div><Factory className="h-4 w-4 text-muted-foreground" /></div>
                {plan ? <div className="mt-4 space-y-3"><p className="text-sm font-semibold">{plan.plan_code}</p><p className="text-xs text-muted-foreground">{plan.period_start} → {plan.period_end}</p><dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-muted-foreground">Movimiento</dt><dd className="mt-1 font-medium">{number(plan.total_movement_tons, ' t')}</dd></div><div><dt className="text-xs text-muted-foreground">Avance</dt><dd className="mt-1 font-medium">{number(plan.planned_advance_m, ' m')}</dd></div></dl><Button variant="outline" size="sm" asChild><Link href="/dashboard/produccion">Abrir Producción</Link></Button></div> : <p className="mt-4 text-sm text-muted-foreground">Sin plan de producción activo en la fuente canónica.</p>}
              </section>

              <section className="rounded-lg border border-border bg-card p-5">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Preventivos</p><h2 className="mt-1 text-base font-semibold">Próximos por horómetro</h2></div><CalendarClock className="h-4 w-4 text-muted-foreground" /></div>
                <div className="mt-4 space-y-3">{preventive.slice(0, 5).map((item) => <div key={item.schedule_id} className="border-t border-border pt-3 first:border-t-0 first:pt-0"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{item.asset_code || item.asset_name || 'Equipo'}</p><Badge variant={item.remaining_hours != null && item.remaining_hours <= 0 ? 'destructive' : 'outline'}>{number(item.remaining_hours, ' h')}</Badge></div>{item.meter_basis_conflict ? <p className="mt-1 text-xs text-destructive">Evidencia de contador en conflicto.</p> : null}</div>)}{preventive.length === 0 ? <p className="text-sm text-muted-foreground">Sin preventivos alertados.</p> : null}</div>
                <Button className="mt-4" variant="outline" size="sm" asChild><Link href="/dashboard/mantenimiento/planificacion">Abrir mantenimiento</Link></Button>
              </section>
            </aside>
          </div>
        </>
      ) : null}
      <details data-testid="planning-more-indicators" className="rounded-lg border bg-card"><summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ver más · Indicadores de planificación</summary><div className="border-t">
      <section className="grid divide-y rounded-lg border border-border bg-card sm:grid-cols-4 sm:divide-x sm:divide-y-0" aria-label="Resumen de planificación">
        {[
          ['Cobertura Ariel', ariel ? `${ariel.sourceCoverage.matched_percent}%` : '—', ariel ? `${ariel.sourceCoverage.matched_rows}/${ariel.sourceCoverage.total_rows} equipos enlazados` : 'Fuente Ariel'],
          ['P1 vencidos', ariel?.priorityCounts['P1 - VENCIDO'] ?? '—', 'Revisión prioritaria'],
          ['Señales', summary ? summary.active_alerts : '—', 'Señales pendientes'],
          ['Bloqueos', summary ? summary.material_blockers : '—', 'Dependencias de abastecimiento'],
        ].map(([label, value, detail]) => (
          <div key={String(label)} className="px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{String(value)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>
      </div></details>
    </div>
  );
}
