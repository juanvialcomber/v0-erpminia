'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CheckCircle2, Database, ExternalLink, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { MaintenanceMaterialTraceabilityReadiness } from '@/components/maintenance/material-traceability-readiness';

type RecoveryCandidate = {
  authority: 'reference_candidate_pending_validation';
  brand: string | null;
  model: string | null;
  family: string | null;
  source_url: string | null;
  source_label: string | null;
};

type Row = {
  id: string;
  asset_code: string | null;
  name: string | null;
  readiness: 'complete' | 'usable' | 'needs_validation';
  missing: string[];
  essential_missing: string[];
  source_ref: string | null;
  validation_status: string | null;
  recovery_candidate: RecoveryCandidate | null;
};

type Payload = {
  summary: {
    total: number;
    complete: number;
    usable: number;
    needs_validation: number;
    missing_asset_type: number;
    missing_criticality: number;
    missing_operational_status: number;
    missing_location: number;
    recovery_candidates: number;
  };
  rows: Row[];
  semantics: string;
  policy: string;
  recovery_policy: string;
  source: string;
  recovery_source: string;
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar completitud de activos.');
  return payload;
};

export default function MaintenanceDataReadinessPage() {
  const { data, error, isLoading, mutate } = useSWR<Payload>('/api/maintenance/data-readiness', fetcher, { revalidateOnFocus: false });

  if (error) return <StatePanel tone="error" title="No fue posible cargar completitud de activos" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} />;
  if (isLoading || !data) return <StatePanel tone="loading" title="Auditando activos canónicos" description="Separando datos materializados de campos pendientes de validación." />;

  const s = data.summary;
  const metrics = [
    ['Activos canónicos', s.total, Database],
    ['Utilizables hoy', s.complete + s.usable, CheckCircle2],
    ['Requieren validación', s.needs_validation, TriangleAlert],
    ['Sin criticidad', s.missing_criticality, ShieldCheck],
  ] as const;

  return <div className="mx-auto w-full max-w-[1600px] space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Mantenimiento · Calidad de datos</PageHeaderEyebrow>
        <PageHeaderTitle>Readiness canónico de activos</PageHeaderTitle>
        <PageHeaderDescription>Qué atributos existen realmente antes de usar criticidad, estado o tipo para priorización, confiabilidad o IA.</PageHeaderDescription>
      </PageHeaderContent>
    </PageHeader>

    <section aria-label="Cobertura canónica" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(([label, value, Icon]) => <Card key={label} className="shadow-none"><CardContent className="p-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-muted-foreground" /></div><p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p></CardContent></Card>)}
    </section>

    <Card className="shadow-none">
      <CardHeader><CardTitle className="text-lg">Brechas que limitan inteligencia</CardTitle><CardDescription>No son datos estimables. Requieren evidencia fuente o validación responsable.</CardDescription></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Tipo de activo', s.missing_asset_type],
          ['Criticidad', s.missing_criticality],
          ['Estado operacional', s.missing_operational_status],
          ['Ubicación', s.missing_location],
        ].map(([label, value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
      </CardContent>
    </Card>

    <MaintenanceMaterialTraceabilityReadiness />

    <StatePanel tone="neutral" title="Frontera de confianza" description={`${data.semantics} ${data.policy}`} className="min-h-0 py-5" />

    <Card className="shadow-none">
      <CardHeader className="gap-2"><CardTitle className="text-lg">Recuperación asistida</CardTitle><CardDescription>{s.recovery_candidates} activo(s) tienen una referencia técnica candidata desde la biblioteca actual. {data.recovery_policy}</CardDescription></CardHeader>
    </Card>

    <Card className="shadow-none">
      <CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="text-lg">Cola de enriquecimiento</CardTitle><CardDescription>Primero aparecen activos con campos esenciales faltantes. Las referencias sugeridas son sólo pistas de recuperación y nunca reemplazan la validación responsable.</CardDescription></div><Badge variant="outline">{data.rows.length}</Badge></CardHeader>
      <CardContent>
        {data.rows.length === 0 ? <StatePanel tone="neutral" title="No hay brechas pendientes" description="Los activos actuales tienen los atributos esenciales materializados." className="min-h-48 border-0 bg-transparent" /> : <div className="divide-y rounded-lg border">{data.rows.slice(0, 100).map((row) => <div key={row.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_1.2fr_1fr_auto] lg:items-center"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{row.asset_code || row.name || 'Activo sin código'}</p><Badge variant={row.readiness === 'needs_validation' ? 'secondary' : 'outline'}>{row.readiness === 'needs_validation' ? 'Validación requerida' : 'Utilizable parcial'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{row.source_ref || 'Sin referencia fuente visible'}</p></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Falta materializar</p><p className="mt-1 text-sm">{row.missing.join(' · ')}</p></div><div>{row.recovery_candidate ? <><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Referencia candidata</p><p className="mt-1 text-sm">{[row.recovery_candidate.brand,row.recovery_candidate.model,row.recovery_candidate.family].filter(Boolean).join(' · ')}</p><p className="mt-1 text-xs text-muted-foreground">Pendiente de validación · no canónica</p></> : <p className="text-xs text-muted-foreground">Sin referencia técnica candidata en la biblioteca actual.</p>}</div><div className="flex flex-wrap gap-2">{row.recovery_candidate?.source_url ? <Button asChild variant="outline" size="sm"><a href={row.recovery_candidate.source_url} target="_blank" rel="noreferrer">Revisar fuente<ExternalLink className="h-4 w-4" /></a></Button> : null}<Button asChild variant="outline" size="sm"><Link href={`/dashboard/mantenimiento/equipos/${row.id}/ficha`}>Abrir ficha<ArrowRight className="h-4 w-4" /></Link></Button></div></div>)}</div>}
      </CardContent>
    </Card>
  </div>;
}
