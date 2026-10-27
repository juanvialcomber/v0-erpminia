'use client';

import useSWR from 'swr';
import { SectionHandover } from '@/components/intake/section-handover';
import { AlertTriangle, Database, FileSpreadsheet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Source = {
  id: string;
  source_file: string;
  source_file_sha256: string;
  source_owner: string | null;
  source_role: string | null;
  source_sheet: string | null;
  imported_at: string;
  status: string;
  notes: string | null;
};

type Response = {
  data: Source[];
  summary: { sources: number; rows: number; accepted: number; reviewRequired: number };
};

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las fuentes de Mantenimiento');
  return payload as Response;
};

export default function MaintenanceSourcesPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/maintenance/sources', fetcher, { revalidateOnFocus: false });

  if (isLoading) return <StatePanel tone="loading" title="Cargando fuentes de Mantenimiento" description="Leyendo provenance y filas importadas." />;
  if (error || !data) return <StatePanel tone="error" title="Fuentes de Mantenimiento no disponibles" description="No se reemplaza una fuente faltante por una lista vacía." />;

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mantenimiento · Provenance</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Fuentes</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Archivos entregados al módulo y su estado de promoción. MOTIL conserva el original y sólo convierte coincidencias verificables en datos canónicos.
        </p>
      </header>

      <SectionHandover section="maintenance" />

      <section className="grid overflow-hidden rounded-lg border sm:grid-cols-4">
        {[
          ['Fuentes', data.summary.sources],
          ['Filas preservadas', data.summary.rows],
          ['Aceptadas', data.summary.accepted],
          ['Revisión requerida', data.summary.reviewRequired],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{Number(value).toLocaleString('es-CL')}</p>
          </div>
        ))}
      </section>

      <section className="divide-y overflow-hidden rounded-lg border">
        {data.data.map((source) => (
          <article key={source.id} className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                  <h2 className="break-all text-sm font-semibold">{source.source_file}</h2>
                  <Badge variant={source.status === 'review_required' ? 'outline' : 'secondary'}>
                    {source.status === 'review_required' ? 'Revisión requerida' : source.status}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground md:grid-cols-3">
                  <p><span className="text-foreground">Hoja:</span> {source.source_sheet || '—'}</p>
                  <p><span className="text-foreground">Responsable fuente:</span> {source.source_owner || '—'}</p>
                  <p><span className="text-foreground">Rol:</span> {source.source_role || '—'}</p>
                </div>
                {source.notes ? <p className="mt-3 text-xs leading-5 text-muted-foreground">{source.notes}</p> : null}
                <p className="mt-3 break-all font-mono text-[10px] text-muted-foreground">SHA-256 {source.source_file_sha256}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {source.status === 'review_required' ? <AlertTriangle className="h-4 w-4" /> : <Database className="h-4 w-4" />}
                <span>{new Date(source.imported_at).toLocaleDateString('es-CL')}</span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
