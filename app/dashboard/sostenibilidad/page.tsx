'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { SectionHandover } from '@/components/intake/section-handover';
import { ArrowRight, FileCheck2, Leaf, ShieldCheck, Upload, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

type OverviewResponse = {
  period: string;
  overview: {
    compliance_score: number;
    total_ncs: number;
    open_ncs: number;
    closed_ncs: number;
    overdue_cas: number;
    trend: 'mejorando' | 'empeorando' | 'stable';
  };
};

type ListResponse<T = unknown> = { data?: T[]; total?: number; items?: T[]; count?: number };

type AreaCard = {
  title: string;
  description: string;
  href: string;
  icon: typeof ShieldCheck;
  facts: Array<{ label: string; value: number | null }>;
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || `No fue posible cargar ${url}`);
  return payload as T;
};

function exactCount(payload: ListResponse | unknown | undefined): number | null {
  if (payload === undefined || payload === null) return null;
  if (Array.isArray(payload)) return payload.length;
  if (typeof payload === 'object') {
    const typed = payload as ListResponse;
    if (Array.isArray(typed.data)) return typed.data.length;
    if (Array.isArray(typed.items)) return typed.items.length;
    if (typeof typed.total === 'number') return typed.total;
    if (typeof typed.count === 'number') return typed.count;
  }
  return null;
}

const value = (count: number | null) => count === null ? '—' : count.toLocaleString('es-CL');

export default function SostenibilidadDashboard() {
  const { data: overviewData, error: overviewError, isLoading: overviewLoading, mutate: refreshOverview } = useSWR<OverviewResponse>('/api/sostenibilidad/dashboard/overview', fetcher, { refreshInterval: 60000 });
  const { data: documentosData } = useSWR<ListResponse>('/api/documents/list?module=prevenci%C3%B3n&category=documentos-hse', fetcher);
  const { data: capacitacionesData } = useSWR<ListResponse>('/api/sostenibilidad/capacitaciones', fetcher);
  const { data: eppData } = useSWR<ListResponse>('/api/sostenibilidad/epp', fetcher);
  const { data: inspeccionesInternasData } = useSWR<ListResponse>('/api/sostenibilidad/inspecciones', fetcher);
  const { data: inspeccionesExternasData } = useSWR<ListResponse>('/api/sostenibilidad/inspecciones?tipo=externas', fetcher);
  const { data: noConformidadesData } = useSWR<ListResponse>('/api/sostenibilidad/no-conformidades', fetcher);
  const { data: accionesCorrectivasData } = useSWR<ListResponse>('/api/sostenibilidad/corrective-actions', fetcher);
  const { data: medioAmbienteData } = useSWR<ListResponse>('/api/sostenibilidad/medio-ambiente', fetcher);
  const { data: comunidadesData } = useSWR<ListResponse>('/api/sostenibilidad/comunidades', fetcher);

  const overview = overviewData?.overview ?? null;
  const docCount = exactCount(documentosData);
  const capCount = exactCount(capacitacionesData);
  const eppCount = exactCount(eppData);
  const internalInspectionCount = exactCount(inspeccionesInternasData);
  const externalInspectionCount = exactCount(inspeccionesExternasData);
  const ncCount = exactCount(noConformidadesData);
  const correctiveActionCount = exactCount(accionesCorrectivasData);
  const environmentCount = exactCount(medioAmbienteData);
  const communityCount = exactCount(comunidadesData);

  const trend = overview?.trend === 'mejorando' ? 'Mejorando' : overview?.trend === 'empeorando' ? 'Empeorando' : overview ? 'Estable' : 'Sin fuente';
  const metrics = [
    { label: 'Cumplimiento', value: overview ? `${overview.compliance_score.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%` : '—', detail: trend },
    { label: 'NC abiertas', value: overview ? overview.open_ncs.toLocaleString('es-CL') : '—', detail: overview ? `${overview.total_ncs} registradas` : 'Sin resumen disponible' },
    { label: 'Acciones vencidas', value: overview ? overview.overdue_cas.toLocaleString('es-CL') : '—', detail: 'Sólo acciones con vencimiento acreditado' },
    { label: 'Inspecciones internas', value: value(internalInspectionCount), detail: 'Fuente específica' },
    { label: 'Inspecciones externas', value: value(externalInspectionCount), detail: 'Fuente específica' },
    { label: 'Documentos HSE', value: value(docCount), detail: 'Biblioteca HSE' },
  ];

  // Cuatro pilares originales de Sostenibilidad (estructura canónica anterior al dashboard).
  const areas: AreaCard[] = [
    {
      title: 'HSE / Prevención de Riesgos',
      description: 'Documentos, capacitación, EPP, inspecciones, no conformidades y acciones correctivas.',
      href: '/dashboard/sostenibilidad/prevencion-riesgos',
      icon: ShieldCheck,
      facts: [
        { label: 'Documentos', value: docCount },
        { label: 'Inspecciones internas', value: internalInspectionCount },
        { label: 'No conformidades', value: ncCount },
      ],
    },
    {
      title: 'Medio Ambiente',
      description: 'Monitoreos, permisos y planes de acción; no se inventan subtotales de permisos o monitoreos.',
      href: '/dashboard/sostenibilidad/medio-ambiente',
      icon: Leaf,
      facts: [{ label: 'Registros ambientales', value: environmentCount }],
    },
    {
      title: 'Comunidades',
      description: 'Partes interesadas, compromisos y licencia social; el total de la fuente no se reutiliza como partes interesadas, compromisos y licencia social.',
      href: '/dashboard/sostenibilidad/comunidades',
      icon: Users,
      facts: [{ label: 'Registros de comunidades', value: communityCount }],
    },
    {
      title: 'Proyectos de Sostenibilidad',
      description: 'Iniciativas, presupuesto y seguimiento de retorno.',
      href: '/dashboard/sostenibilidad/reportes',
      icon: FileCheck2,
      facts: [{ label: 'Ver seguimiento', value: null }],
    },
  ];

  return (
    <div className="space-y-6">
      <SectionHandover section="hse" />
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>HSE · Sostenibilidad</PageHeaderEyebrow>
          <PageHeaderTitle>Sostenibilidad</PageHeaderTitle>
          <PageHeaderDescription>Conoce la normativa, revisa si aplica a La Patagua y gestiona sólo las obligaciones confirmadas. Una obligación sin evaluar no es incumplimiento. “—” significa que la fuente no respondió.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button asChild variant="outline"><Link href="/dashboard/sostenibilidad/prevencion-riesgos/inspecciones/importar"><Upload className="h-4 w-4"/>Importar inspecciones</Link></Button>
        </PageHeaderActions>
      </PageHeader>

      {overviewError ? <StatePanel tone="warning" title="Resumen HSE no disponible" description="Las demás fuentes siguen visibles por separado. No se muestran ceros de reemplazo para cumplimiento, no conformidades o acciones vencidas." actions={<Button variant="outline" onClick={() => void refreshOverview()}>Reintentar</Button>} className="min-h-0 py-5"/> : null}

      <section aria-label="Pendientes HSE" className="rounded-lg border bg-card p-4">
        <div className="mb-3"><h2 className="text-base font-semibold">Qué requiere atención</h2><p className="text-sm text-muted-foreground">Accesos directos a los registros de la faena. Sin inferir incidentes ni cumplimiento a partir de fuentes vacías.</p></div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Link href="/dashboard/sostenibilidad/no-conformidades" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/30"><span>No conformidades abiertas</span><strong className="tabular-nums">{overview ? value(overview.open_ncs) : 'Sin dato'}</strong></Link>
          <Link href="/dashboard/sostenibilidad/no-conformidades" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/30"><span>Acciones correctivas vencidas</span><strong className="tabular-nums">{overview ? value(overview.overdue_cas) : 'Sin dato'}</strong></Link>
          <Link href="/dashboard/sostenibilidad/prevencion-riesgos/inspecciones" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/30"><span>Consultar inspecciones</span><ArrowRight className="size-4 text-muted-foreground"/></Link>
          <Link href="/dashboard/legal" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted/30"><span>Escalar a Legal cuando corresponda</span><ArrowRight className="size-4 text-muted-foreground"/></Link>
        </div>
      </section>

      <section aria-label="Estado de Sostenibilidad" className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map((metric) => <div key={metric.label} className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">{metric.label}</p><p className="mt-1 text-2xl font-semibold tracking-tight">{overviewLoading && ['Cumplimiento','NC abiertas','Acciones vencidas'].includes(metric.label) ? '—' : metric.value}</p><p className="mt-1 text-xs text-muted-foreground">{metric.detail}</p></div>)}
      </section>

      <section className="space-y-3" aria-labelledby="sustainability-areas">
        <div><h2 id="sustainability-areas" className="text-lg font-semibold tracking-tight">Áreas</h2><p className="text-sm text-muted-foreground">Cada cifra conserva su fuente. Cero es un dato real; “—” es falta de respuesta.</p></div>
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-2">
          {areas.map((area) => {
            const Icon = area.icon;
            return <Link key={area.title} href={area.href} className="group bg-card px-5 py-4 transition-colors hover:bg-muted/30"><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-background"><Icon className="h-4 w-4"/></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><h3 className="font-medium">{area.title}</h3><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1"/></div><p className="mt-1 text-sm text-muted-foreground">{area.description}</p><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">{area.facts.map((fact) => <div key={fact.label}><p className="text-lg font-semibold tabular-nums">{value(fact.value)}</p><p className="text-xs text-muted-foreground">{fact.label}</p></div>)}</div></div></div></Link>;
          })}
        </div>
      </section>

      <section className="space-y-3 border-t pt-5">
        <div><h2 className="text-lg font-semibold tracking-tight">Accesos</h2><p className="text-sm text-muted-foreground">Abre directamente el flujo que necesitas.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline"><Link href="/dashboard/sostenibilidad/prevencion-riesgos/capacitaciones">Capacitaciones</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/sostenibilidad/prevencion-riesgos/epp">EPP</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/sostenibilidad/prevencion-riesgos/inspecciones-externas">Inspecciones externas</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/sostenibilidad/medio-ambiente">Medio ambiente</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/sostenibilidad/comunidades">Comunidades</Link></Button>
          <Button asChild variant="outline"><Link href="/dashboard/sostenibilidad/reportes">Reportes</Link></Button>
        </div>
      </section>
    </div>
  );
}
