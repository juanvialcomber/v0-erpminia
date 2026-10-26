'use client';

import useSWR from 'swr';
import { Database, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Source = {
  sourceTable: string;
  recognitionStatus: 'recognized' | 'committed';
  label: string;
  meaning: string;
  records: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  currency: string;
  provenanceKind: 'canonical_table';
};

type Response = {
  data: Source[];
  summary: {
    sources: number;
    auditEvents: number;
    recognizedEvents: number;
    committedEvents: number;
    documentCoreRecords: number;
  };
};

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las fuentes de Finanzas');
  return payload as Response;
};

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha';
}

export default function FinanceSourcesPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/finance/sources', fetcher, { revalidateOnFocus: false });

  if (isLoading) return <StatePanel tone="loading" title="Cargando fuentes financieras" description="Revisando el origen y la cobertura de las cifras financieras." />;
  if (error || !data) return <StatePanel tone="error" title="No fue posible cargar las fuentes" description="Las cifras no se reemplazan por valores vacíos cuando falta información de origen." />;

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Finanzas</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Fuentes y calidad</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Muestra de dónde provienen las cifras, qué período cubren y si existe respaldo documental asociado.
        </p>
      </header>

      <section className="grid overflow-hidden rounded-lg border sm:grid-cols-4">
        {[
          ['Registros trazables', data.summary.auditEvents],
          ['Costo reconocido', data.summary.recognizedEvents],
          ['Compra comprometida', data.summary.committedEvents],
          ['Documentos Finanzas', data.summary.documentCoreRecords],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{Number(value).toLocaleString('es-CL')}</p>
          </div>
        ))}
      </section>

      {data.summary.documentCoreRecords === 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">Los registros históricos tienen trazabilidad financiera, pero no cuentan con archivos originales asociados.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Los documentos que se incorporen desde ahora quedarán vinculados como respaldo sin modificar el historial existente.
          </p>
        </div>
      ) : null}

      <section className="divide-y overflow-hidden rounded-lg border">
        {data.data.map((source) => (
          <article key={source.sourceTable} className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Database className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">{source.label}</h2>
                  <Badge variant="secondary">Fuente registrada</Badge>
                  <Badge variant="outline">{source.meaning}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {source.records.toLocaleString('es-CL')} registros · {source.currency}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cobertura: {date(source.firstEventAt)} → {date(source.lastEventAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>No incluye archivo original</span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
