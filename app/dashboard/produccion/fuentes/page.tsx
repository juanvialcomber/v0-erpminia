'use client';

import useSWR from 'swr';
import { SectionHandover } from '@/components/intake/section-handover';
import { Database, FileCheck2, FileClock, FileSpreadsheet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Source = {
  id: string;
  source_file: string;
  source_file_sha256: string;
  source_kind: string;
  canonical_role: 'canonical' | 'supporting' | 'plan_only';
  row_count: number | null;
  formula_count: number | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

type Response = {
  data: Source[];
  summary: { total: number; canonical: number; supporting: number; planOnly: number };
};

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las fuentes de Producción');
  return payload as Response;
};

const roleLabel: Record<Source['canonical_role'], string> = {
  canonical: 'Canónica',
  supporting: 'Soporte',
  plan_only: 'Sólo plan',
};

export default function ProductionSourcesPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/produccion/sources', fetcher, { revalidateOnFocus: false });

  if (isLoading) return <StatePanel tone="loading" title="Cargando fuentes de Producción" description="Verificando provenance, rol canónico y cobertura." />;
  if (error || !data) return <StatePanel tone="error" title="Fuentes de Producción no disponibles" description="No se reemplaza la fuente faltante por una lista vacía." />;

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Producción · Provenance</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Fuentes canónicas</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Archivos aceptados que alimentan Producción. MOTIL distingue ejecución, respaldo y planificación; un plan nunca se presenta como dato real.
        </p>
      </header>

      <SectionHandover section="production" />

      <section className="grid overflow-hidden rounded-lg border sm:grid-cols-4">
        {[
          ['Fuentes', data.summary.total],
          ['Canónicas', data.summary.canonical],
          ['Soporte', data.summary.supporting],
          ['Sólo plan', data.summary.planOnly],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="divide-y overflow-hidden rounded-lg border">
        {data.data.map((source) => (
          <article key={source.id} className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {source.source_file.toLowerCase().endsWith('.pdf') ? <FileCheck2 className="h-4 w-4 text-muted-foreground" /> : <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />}
                  <h2 className="break-all text-sm font-semibold">{source.source_file}</h2>
                  <Badge variant={source.canonical_role === 'canonical' ? 'secondary' : 'outline'}>{roleLabel[source.canonical_role]}</Badge>
                  <Badge variant="outline">{source.source_kind}</Badge>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                  <p><span className="text-foreground">Período:</span> {source.period_start || '—'} → {source.period_end || '—'}</p>
                  <p><span className="text-foreground">Filas:</span> {source.row_count == null ? '—' : source.row_count.toLocaleString('es-CL')}</p>
                  <p><span className="text-foreground">Fórmulas:</span> {source.formula_count == null ? '—' : source.formula_count.toLocaleString('es-CL')}</p>
                </div>
                <p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {source.source_file_sha256}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {source.canonical_role === 'plan_only' ? <FileClock className="h-4 w-4" /> : <Database className="h-4 w-4" />}
                <span>{source.canonical_role === 'plan_only' ? 'Planificación' : 'Evidencia fuente'}</span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
