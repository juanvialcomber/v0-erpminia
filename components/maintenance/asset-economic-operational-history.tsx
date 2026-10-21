'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Activity, AlertTriangle, ArrowRight, CircleDollarSign, Gauge, RefreshCw, ShieldCheck, Wrench, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

type AnnualRow = { year: number; event_count: number; recognized_clp: number };
type CompositionRow = { event_type: string; event_count: number; recognized_clp: number };
type RootCause = { root_cause: string | null; occurrences: number; audited_total_cost: number; total_actual_hours: number; total_downtime_hours: number; first_seen_at: string | null; last_seen_at: string | null; is_recurring: boolean };
type Signal = { key: string; severity: 'high' | 'medium' | 'info'; fact: string; next_action: string; href: string };
type Response = {
  historicalEconomics: {
    recognized_event_count: number;
    recognized_clp: number;
    first_event_at: string | null;
    last_event_at: string | null;
    years_with_evidence: number;
    ledger_events_with_work_order: number;
    annual: AnnualRow[];
    composition: CompositionRow[];
    truncated: boolean;
  };
  observedUse: {
    drilling_source_status: 'available' | 'unavailable';
    evidence_type: 'production_drilling_reports' | 'runtime_meter' | 'none';
    drilling_report_count: number;
    first_report_at: string | null;
    last_report_at: string | null;
    drilled_meters: number;
    operational_reports: number;
    operational_with_observations_reports: number;
    out_of_service_reports: number;
    degraded_reports: number;
    external_constraint_reports: number;
    historical_cost_during_observed_use_clp: number | null;
    runtime: null | {
      reading_count: number;
      first_reading_at: string | null;
      last_reading_at: string | null;
      latest_meter_hours: number | null;
      observed_operating_hours: number;
      reset_count: number;
      usable_for_rate_metrics: boolean;
    };
  };
  currentExecution: {
    active_work_orders: number;
    critical_open: number;
    operational_blockers: number;
    overdue_preventives: number;
    meter_basis_conflicts: number;
  };
  auditedReliability: null | {
    audited_closures: number;
    closures_with_root_cause: number;
    root_cause_coverage_percent: number | null;
    recurring_cause_count: number;
    audited_total_cost: number;
    total_downtime_hours: number;
    root_causes: RootCause[];
  };
  identityReadiness: {
    validation_status: string | null;
    technical_fields_known: number;
    technical_fields_total: number;
    has_cost_center: boolean;
  };
  signals: Signal[];
  semantics: Record<string, string>;
};

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la historia económica-operacional');
  return payload;
};

const money = (value: unknown) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
const number = (value: unknown, digits = 0) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: digits }).format(Number(value || 0));
const shortDate = (value: string | null) => value ? new Intl.DateTimeFormat('es-CL', { year: 'numeric', month: 'short' }).format(new Date(value)) : 'Sin fecha';

export function AssetEconomicOperationalHistory({ assetId }: { assetId: string }) {
  const { data, error, isLoading, mutate } = useSWR<Response>(assetId ? `/api/maintenance/assets/${encodeURIComponent(assetId)}/economic-operational-history` : null, fetcher, { revalidateOnFocus: false });

  if (isLoading) return <StatePanel tone="loading" title="Construyendo historia económica-operacional" description="Conectando costo, uso observado, condición, identidad técnica y confiabilidad auditada." />;
  if (error || !data) return <StatePanel tone="error" title="No fue posible cargar la historia económica-operacional" description={error instanceof Error ? error.message : 'No hay datos disponibles.'} actions={<Button variant="outline" onClick={() => void mutate()}><RefreshCw className="h-4 w-4"/>Reintentar</Button>} />;

  const historical = data.historicalEconomics;
  const observed = data.observedUse;
  const drillingUnavailable = observed.drilling_source_status === 'unavailable';
  const reliability = data.auditedReliability;
  const topYear = [...historical.annual].sort((a, b) => b.recognized_clp - a.recognized_clp)[0] || null;
  const signalCount = data.signals.length;
  const annualMax = Math.max(...historical.annual.map((item) => item.recognized_clp), 1);
  const observedConditionTotal = observed.operational_reports + observed.operational_with_observations_reports + observed.out_of_service_reports;
  const degradedShare = observedConditionTotal > 0 ? Math.round((observed.degraded_reports / observedConditionTotal) * 100) : null;
  const hasDrillingUse = observed.drilling_report_count > 0;
  const usableRuntime = Boolean(observed.runtime?.usable_for_rate_metrics);

  return <Card className="shadow-none">
    <CardHeader className="gap-4 border-b sm:flex-row sm:items-start sm:justify-between">
      <div>
        <CardTitle className="text-lg">Historia económica-operacional</CardTitle>
        <CardDescription>Conecta cuánto ha costado el equipo, qué uso real está observado y qué fallas o causas están confirmadas. Donde falta evidencia, MOTIL lo deja explícito.</CardDescription>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">{historical.years_with_evidence} años con evidencia</Badge>
        {signalCount > 0 ? <Badge variant="secondary">{signalCount} señal(es)</Badge> : <Badge variant="outline">Sin señales actuales</Badge>}
      </div>
    </CardHeader>
    <CardContent className="space-y-6 pt-5">
      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumen económico-operacional">
        <Metric label="Costo histórico reconocido" value={money(historical.recognized_clp)} detail={`${number(historical.recognized_event_count)} eventos canónicos`} />
        <Metric label="Uso observado" value={hasDrillingUse ? `${number(observed.drilled_meters, 1)} m` : usableRuntime ? `${number(observed.runtime?.observed_operating_hours, 1)} h` : 'Sin base'} detail={hasDrillingUse ? `${number(observed.drilling_report_count)} reportes · ${shortDate(observed.first_report_at)} → ${shortDate(observed.last_report_at)}` : usableRuntime ? `${number(observed.runtime?.reading_count)} lecturas de horómetro` : 'Sin evidencia utilizable de uso'} />
        <Metric label="Condición observada" value={observedConditionTotal > 0 ? `${number(observed.degraded_reports)} degradados` : 'Sin base'} detail={degradedShare == null ? 'Sin reportes de condición' : `${degradedShare}% de estados clasificados · ${number(observed.out_of_service_reports)} fuera de servicio`} />
        <Metric label="Causa confirmada" value={reliability && reliability.audited_closures > 0 ? `${number(reliability.closures_with_root_cause)} cierres` : 'Sin base'} detail={reliability?.root_cause_coverage_percent == null ? 'Todavía no hay historia auditada de causa raíz' : `${number(reliability.root_cause_coverage_percent)}% cobertura de causa raíz`} />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_1fr]">
        <section className="rounded-lg border">
          <div className="border-b px-4 py-3">
            <h3 className="font-medium">Evolución anual del gasto</h3>
            <p className="mt-1 text-xs text-muted-foreground">Sólo eventos reconocidos ya vinculados al activo canónico.</p>
          </div>
          <div className="divide-y">
            {historical.annual.length === 0 ? <p className="p-4 text-sm text-muted-foreground">Este equipo todavía no tiene historia económica vinculada.</p> : historical.annual.map((row) => {
              const width = Math.max(3, Math.round((row.recognized_clp / annualMax) * 100));
              return <div key={row.year} className="grid gap-3 px-4 py-3 md:grid-cols-[72px_minmax(0,1fr)_150px] md:items-center">
                <div><p className="font-medium tabular-nums">{row.year}</p><p className="text-xs text-muted-foreground">{number(row.event_count)} eventos</p></div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-foreground/70" style={{ width: `${width}%` }} /></div>
                <p className="text-right font-medium tabular-nums">{money(row.recognized_clp)}</p>
              </div>;
            })}
          </div>
          {topYear ? <div className="border-t px-4 py-3 text-xs text-muted-foreground">Año con mayor gasto observado: <span className="font-medium text-foreground">{topYear.year} · {money(topYear.recognized_clp)}</span>. Esto describe gasto, no causa de falla.</div> : null}
        </section>

        <section className="rounded-lg border">
          <div className="border-b px-4 py-3"><h3 className="font-medium">Puente entre costo, uso y falla</h3><p className="mt-1 text-xs text-muted-foreground">Qué capas están conectadas hoy y qué sigue sin poder afirmarse.</p></div>
          <div className="space-y-4 p-4 text-sm">
            <EvidenceRow label="Historia económica" value={`${number(historical.recognized_event_count)} eventos`} />
            <EvidenceRow label="Uso operacional" value={hasDrillingUse ? `${number(observed.drilling_report_count)} reportes / ${number(observed.drilled_meters, 1)} m` : usableRuntime ? `${number(observed.runtime?.observed_operating_hours, 1)} h observadas` : 'Sin base'} />
            <EvidenceRow label="Condición degradada" value={observedConditionTotal > 0 ? `${number(observed.degraded_reports)} reportes` : 'Sin base'} />
            <EvidenceRow label="Cierres auditados" value={number(reliability?.audited_closures || 0)} />
            <EvidenceRow label="Causa raíz confirmada" value={reliability?.root_cause_coverage_percent == null ? 'Sin base' : `${number(reliability.root_cause_coverage_percent)}%`} />
            <EvidenceRow label="Costo durante ventana de uso" value={observed.historical_cost_during_observed_use_clp == null ? 'Sin ventana comparable' : money(observed.historical_cost_during_observed_use_clp)} />
          </div>
          <div className="border-t px-4 py-3 text-xs leading-5 text-muted-foreground">El monto de la ventana de uso sólo indica superposición temporal entre gasto y actividad observada. No se presenta como costo por metro, costo por hora ni efecto de una falla.</div>
        </section>
      </div>

      {hasDrillingUse || observed.runtime ? <section className="rounded-lg border">
        <div className="border-b px-4 py-3"><h3 className="font-medium">Uso y condición observados</h3><p className="mt-1 text-xs text-muted-foreground">Evidencia de producción y horómetro disponible para este activo.</p></div>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Reportes operacionales" value={drillingUnavailable ? "Sin acceso a fuente" : number(observed.drilling_report_count)} detail={drillingUnavailable ? "Fuente de perforación no disponible; otros datos conservados" : hasDrillingUse ? `${shortDate(observed.first_report_at)} → ${shortDate(observed.last_report_at)}` : 'Sin reportes de perforación'} />
          <Metric label="Producción observada" value={hasDrillingUse ? `${number(observed.drilled_meters, 1)} m` : 'No aplica / sin base'} detail="Metros perforados registrados; no equivalen a horas de motor" />
          <Metric label="Fuera de servicio" value={drillingUnavailable ? "Sin base" : number(observed.out_of_service_reports)} detail={drillingUnavailable ? "Fuente de perforación no disponible" : `${number(observed.operational_with_observations_reports)} operativos con observaciones`} />
          <Metric label="Restricciones externas" value={number(observed.external_constraint_reports)} detail="Agua, energía o falta de dotación reportadas; no se clasifican automáticamente como falla mecánica" />
        </div>
        <div className="grid gap-4 border-t p-4 text-sm md:grid-cols-2">
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Horómetro</p><p className="mt-1 font-medium">{observed.runtime && observed.runtime.reading_count > 0 ? `${number(observed.runtime.reading_count)} lectura(s) · ${observed.runtime.latest_meter_hours == null ? 'última sin valor' : `${number(observed.runtime.latest_meter_hours, 1)} h`}` : 'Sin lecturas suficientes'}</p><p className="mt-1 text-xs text-muted-foreground">{usableRuntime ? 'La secuencia es utilizable para métricas de tasa.' : 'No usar todavía para costo/hora o MTBF por horas.'}</p></div>
          <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Frontera de interpretación</p><p className="mt-1 text-muted-foreground">{data.semantics.observed_condition}</p></div>
        </div>
      </section> : null}

      {reliability?.root_causes?.length ? <section className="rounded-lg border">
        <div className="border-b px-4 py-3"><h3 className="font-medium">Causas raíz auditadas</h3><p className="mt-1 text-xs text-muted-foreground">Sólo causas registradas en cierres modernos auditados; no se proyectan hacia el historial anterior.</p></div>
        <div className="divide-y">{reliability.root_causes.map((cause, index) => <div key={`${cause.root_cause || 'sin-causa'}-${index}`} className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_120px_150px] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{cause.root_cause || 'Causa sin descripción'}</p>{cause.is_recurring ? <Badge variant="secondary">Recurrente</Badge> : null}</div><p className="mt-1 text-xs text-muted-foreground">{shortDate(cause.first_seen_at)} → {shortDate(cause.last_seen_at)} · {number(cause.total_downtime_hours, 1)} h de detención auditada</p></div><p className="text-sm tabular-nums md:text-right">{number(cause.occurrences)} ocurrencia(s)</p><p className="font-medium tabular-nums md:text-right">{money(cause.audited_total_cost)}</p></div>)}</div>
      </section> : null}

      {historical.composition.length > 0 ? <section>
        <div className="mb-3"><h3 className="font-medium">Composición del costo histórico</h3><p className="text-xs text-muted-foreground">Clasificación por tipo de evento del ledger, sin atribución automática a falla.</p></div>
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {historical.composition.slice(0, 4).map((row) => <div key={row.event_type} className="bg-card p-4"><p className="text-xs text-muted-foreground">{row.event_type}</p><p className="mt-2 font-semibold tabular-nums">{money(row.recognized_clp)}</p><p className="mt-1 text-xs text-muted-foreground">{number(row.event_count)} eventos</p></div>)}
        </div>
      </section> : null}

      <section className="rounded-lg border">
        <div className="border-b px-4 py-3"><h3 className="font-medium">Qué requiere atención</h3><p className="mt-1 text-xs text-muted-foreground">Hechos observados y próxima acción; diagnóstico y prioridad siguen siendo humanos.</p></div>
        {data.signals.length === 0 ? <StatePanel tone="neutral" title="Sin señales que requieran revisión adicional" description="El historial permanece disponible como contexto económico." className="min-h-0 border-0 bg-transparent py-6"/> : <div className="divide-y">{data.signals.map((signal) => <div key={signal.key} className="grid gap-4 p-4 lg:grid-cols-[auto_minmax(0,1fr)_44px] lg:items-start">
          <div className="pt-0.5">{signal.severity === 'high' ? <AlertTriangle className="h-5 w-5"/> : signal.severity === 'medium' ? <Wrench className="h-5 w-5"/> : <ShieldCheck className="h-5 w-5"/>}</div>
          <div><div className="flex flex-wrap items-center gap-2"><Badge variant={signal.severity === 'high' ? 'destructive' : signal.severity === 'medium' ? 'secondary' : 'outline'}>{signal.severity === 'high' ? 'Alta' : signal.severity === 'medium' ? 'Media' : 'Evidencia'}</Badge><p className="font-medium">{signal.fact}</p></div><p className="mt-2 text-sm text-muted-foreground">{signal.next_action}</p></div>
          <Button asChild variant="ghost" size="icon-sm" aria-label="Abrir acción"><Link href={signal.href}><ArrowRight className="h-4 w-4"/></Link></Button>
        </div>)}</div>}
      </section>

      <div className="grid gap-3 border-t pt-4 text-xs text-muted-foreground md:grid-cols-4">
        <TrustRule icon={CircleDollarSign} title="Costo" text={data.semantics.historical_cost} />
        <TrustRule icon={Gauge} title="Uso" text={data.semantics.observed_use} />
        <TrustRule icon={Activity} title="Condición" text={data.semantics.observed_condition} />
        <TrustRule icon={ShieldCheck} title="Decisión" text={data.semantics.operational_risk} />
      </div>
      {historical.truncated ? <p className="text-xs text-destructive">La vista alcanzó el límite técnico de eventos del equipo; revisar el ledger para una extracción completa.</p> : null}
    </CardContent>
  </Card>;
}

function Metric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="bg-card p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-lg font-semibold tabular-nums">{String(value)}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b pb-3 last:border-0 last:pb-0"><span className="text-muted-foreground">{label}</span><span className="font-medium tabular-nums text-right">{value}</span></div>;
}

function TrustRule({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return <div><div className="flex items-center gap-2 font-medium text-foreground"><Icon className="h-4 w-4"/>{title}</div><p className="mt-1 leading-5">{text}</p></div>;
}
