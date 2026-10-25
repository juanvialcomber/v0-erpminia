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

type LaudusCapability = {
  path: string;
  methods: string[];
  domain: string;
  motilModule: string;
  value: string;
  status: 'connector_ready' | 'available' | 'evaluate';
};

type LaudusResponse = {
  generatedAt: string;
  version: string | null;
  summary: { endpoints: number; connectorReady: number; writeCapable: number; domains: number };
  rows: LaudusCapability[];
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

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las fuentes de Finanzas');
  return payload as T;
};

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha';
}

export default function FinanceSourcesPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/finance/sources', fetcher, { revalidateOnFocus: false });
  const { data: laudus, error: laudusError, isLoading: laudusLoading } = useSWR<LaudusResponse>('/api/integrations/laudus/capabilities', fetcher, { revalidateOnFocus: false, refreshInterval: 6 * 60 * 60 * 1000 });

  if (isLoading) return <StatePanel tone="loading" title="Cargando fuentes financieras" description="Leyendo la trazabilidad canónica certificada." />;
  if (error || !data) return <StatePanel tone="error" title="Fuentes financieras no disponibles" description="No se reemplaza provenance faltante por una lista vacía." />;

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Finanzas · Provenance</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Fuentes</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Origen certificado del costo reconocido y de las compras comprometidas. MOTIL mantiene separada la tabla canónica de los archivos documentales nuevos.
        </p>
      </header>

      <section className="overflow-hidden rounded-lg border">
        <div className="border-b px-4 py-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Qué más puede aportar Laudus</h2>
              <p className="mt-1 text-xs text-muted-foreground">MOTIL lee el Swagger vigente y separa disponibilidad de integración real.</p>
            </div>
            {!laudusLoading && !laudusError && laudus ? <p className="text-xs text-muted-foreground">{laudus.summary.endpoints.toLocaleString('es-CL')} capacidades detectadas</p> : null}
          </div>
        </div>
        {laudusLoading ? <div className="p-4 text-sm text-muted-foreground">Verificando capacidades de Laudus…</div> : null}
        {laudusError ? <div className="p-4 text-sm text-muted-foreground">No fue posible verificar el catálogo Laudus en este momento.</div> : null}
        {!laudusLoading && !laudusError && laudus ? <div className="divide-y">
          {laudus.rows.filter((row) => row.motilModule !== 'Por evaluar').slice(0, 12).map((row) => (
            <article key={row.path} className="grid gap-2 px-4 py-3 lg:grid-cols-[140px_1fr_auto] lg:items-center">
              <div>
                <p className="text-sm font-medium">{row.motilModule}</p>
                <p className="text-xs text-muted-foreground">{row.domain}</p>
              </div>
              <div className="min-w-0">
                <p className="text-sm">{row.value}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{row.path}</p>
              </div>
              <Badge variant={row.status === 'connector_ready' ? 'secondary' : 'outline'}>
                {row.status === 'connector_ready' ? 'Conector preparado' : row.status === 'available' ? 'Disponible en Laudus' : 'Por evaluar'}
              </Badge>
            </article>
          ))}
        </div> : null}
      </section>

      <section className="grid overflow-hidden rounded-lg border sm:grid-cols-4">
        {[
          ['Eventos auditables', data.summary.auditEvents],
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
          <p className="text-sm font-medium">La trazabilidad histórica está certificada por tablas canónicas, no por archivos preservados en el Document Core.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Los archivos que se suban desde ahora a Finanzas quedarán en el núcleo documental sin alterar los eventos históricos certificados.
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
                  <Badge variant="secondary">Tabla canónica</Badge>
                  <Badge variant="outline">{source.meaning}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {source.sourceTable} · {source.records.toLocaleString('es-CL')} eventos · {source.currency}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cobertura: {date(source.firstEventAt)} → {date(source.lastEventAt)}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="h-4 w-4" />
                <span>No se presenta como archivo Excel original</span>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
