'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, Clock3, RefreshCw, Repeat2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la confiabilidad auditada');
  return payload;
};

const number = (value: unknown, digits = 1) => value == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: digits }).format(Number(value));
const money = (value: unknown) => value == null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value));
const hours = (value: unknown) => value == null ? 'Sin base suficiente' : `${number(value)} h`;

export default function ReliabilityPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/maintenance/reliability', fetcher, { revalidateOnFocus: false });
  const summary = data?.summary;
  const assets = Array.isArray(data?.assets) ? data.assets : [];
  const recurringCauses = Array.isArray(data?.recurringCauses) ? data.recurringCauses : [];
  const priorityCause = recurringCauses[0];
  const priorityAsset = assets.find((row: any) => row.has_recurring_root_cause || Number(row.runtime?.valid_mtbf_intervals || 0) > 0) || assets[0];
  const priorityAssetId = priorityCause?.canonical_asset_id || priorityAsset?.canonical_asset_id || null;
  const priorityHref = priorityAssetId
    ? `/dashboard/mantenimiento/equipos/${priorityAssetId}`
    : null;
  const preventiveReviewHref = priorityAssetId
    ? `/dashboard/mantenimiento/preventivo-horas?assetId=${encodeURIComponent(priorityAssetId)}`
    : null;

  return <div className="mx-auto w-full max-w-[1600px] space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Mantenimiento · evidencia auditada</PageHeaderEyebrow>
        <PageHeaderTitle>Qué requiere revisión de confiabilidad</PageHeaderTitle>
        <PageHeaderDescription>Prioriza recurrencias y equipos con evidencia suficiente. MTBF sólo aparece cuando existen eventos correctivos comparables y horómetro utilizable; MOTIL no convierte frecuencia en probabilidad de falla.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className="h-4 w-4"/>Actualizar</Button>
        {preventiveReviewHref ? <Button asChild variant="outline"><Link href={preventiveReviewHref}>Revisar preventivo</Link></Button> : null}
        {priorityHref ? <Button asChild><Link href={priorityHref}>Revisar prioridad<ArrowRight className="h-4 w-4"/></Link></Button> : null}
      </PageHeaderActions>
    </PageHeader>

    {error ? <StatePanel tone="error" title="No se pudo cargar confiabilidad" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} className="min-h-0 py-5"/> : null}

    <section aria-label="Base de confiabilidad" className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Activos con evidencia" value={summary?.assets_with_audited_closures} detail="Con cierres auditados"/>
      <Metric label="Con MTBF válido" value={summary?.assets_with_valid_mtbf} detail="Base suficiente"/>
      <Metric label="Recurrencias confirmadas" value={recurringCauses.length} detail="Causa repetida auditada"/>
      <Metric label="Costo auditado" value={money(summary?.audited_total_cost)} detail="Sólo cierres auditados"/>
    </section>

    {!isLoading && !error && recurringCauses.length > 0 ? <Card className="shadow-none">
      <CardHeader><CardTitle className="text-lg">Recurrencias que requieren decisión</CardTitle><CardDescription>Repeticiones observadas en cierres auditados. La recurrencia no prueba una causa futura ni autoriza trabajo automáticamente.</CardDescription></CardHeader>
      <CardContent className="p-0"><div className="divide-y">{recurringCauses.map((row: any, index: number) => <Link key={`${row.canonical_asset_id}-${row.root_cause_key}`} href={`/dashboard/mantenimiento/equipos/${row.canonical_asset_id}`} className="grid gap-3 p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:grid-cols-[40px_minmax(0,1fr)_auto] md:items-center">
        <span className="text-xs tabular-nums text-muted-foreground">#{index + 1}</span>
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="destructive">{row.occurrences} cierres</Badge><p className="font-medium">{row.asset_code ? `${row.asset_code} · ` : ''}{row.asset_name || 'Equipo sin nombre'}</p></div><p className="mt-1 text-sm text-muted-foreground">Causa registrada: {row.root_cause}</p><p className="mt-1 text-xs text-muted-foreground">Costo auditado {money(row.audited_total_cost)} · Horas OT {number(row.total_actual_hours)} · Detención {hours(row.total_downtime_hours)}</p></div>
        <ArrowRight className="h-4 w-4 text-muted-foreground"/>
      </Link>)}</div></CardContent>
    </Card> : null}

    <Card className="shadow-none">
      <CardHeader><CardTitle className="text-lg">Evidencia por equipo</CardTitle><CardDescription>MTBF, MTTR y cobertura se muestran sólo cuando la fuente permite calcularlos sin completar datos ausentes.</CardDescription></CardHeader>
      <CardContent className="p-0">
        {isLoading ? <StatePanel tone="loading" title="Cargando evidencia auditada" className="min-h-64 border-0 bg-transparent"/> : !error && assets.length === 0 ? <StatePanel tone="neutral" title="Sin base suficiente todavía" description="Las OT históricas sin snapshot no se usan para inferir recurrencia, costo ni MTBF. Se necesitan cierres auditados y lecturas reales de horómetro." actions={<Button asChild variant="outline"><Link href="/dashboard/mantenimiento/horometros">Revisar horómetros</Link></Button>} className="min-h-64 border-0 bg-transparent"/> : !error ? <div className="divide-y">{assets.map((row: any) => <Link key={row.canonical_asset_id} href={`/dashboard/mantenimiento/equipos/${row.canonical_asset_id}`} className="block p-4 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2"><Badge variant="outline">{row.audited_closures} cierre{Number(row.audited_closures) === 1 ? '' : 's'}</Badge>{Number(row.runtime?.valid_mtbf_intervals || 0) > 0 ? <Badge variant="secondary">MTBF con evidencia</Badge> : <Badge variant="outline">MTBF pendiente</Badge>}{row.has_recurring_root_cause ? <Badge variant="destructive">Recurrencia auditada</Badge> : null}</div><p className="mt-3 font-medium">{row.asset_code ? `${row.asset_code} · ` : ''}{row.asset_name || 'Equipo sin nombre'}</p><div className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4"><span><Repeat2 className="mr-1 inline h-3.5 w-3.5"/>MTBF: {hours(row.runtime?.mtbf_operating_hours)}</span><span>MTTR: {hours(row.runtime?.mttr_hours)}</span><span>Cobertura horómetro: {row.runtime?.meter_event_coverage_percent == null ? 'Sin base suficiente' : `${number(row.runtime.meter_event_coverage_percent)}%`}</span><span><Clock3 className="mr-1 inline h-3.5 w-3.5"/>Detención: {hours(row.total_downtime_hours)}</span></div></div><ArrowRight className="mt-1 h-4 w-4 text-muted-foreground"/></div></Link>)}</div> : null}
      </CardContent>
    </Card>

    <div className="border-t pt-4 text-xs leading-5 text-muted-foreground"><AlertTriangle className="mr-1 inline h-3.5 w-3.5"/>MTBF usa diferencias de horómetro entre cierres correctivos auditados consecutivos. Si falta una lectura o se detecta reinicio del medidor, ese intervalo se excluye. MTTR usa las horas reales de ejecución registradas en la OT.</div>
  </div>;
}

function Metric({label,value,detail}:{label:string;value:unknown;detail:string}) {
  return <div className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-2 flex items-end justify-between gap-3"><p className="text-3xl font-semibold tracking-tight tabular-nums">{value == null ? '—' : String(value)}</p><p className="max-w-36 text-right text-xs leading-4 text-muted-foreground">{detail}</p></div></div>;
}
