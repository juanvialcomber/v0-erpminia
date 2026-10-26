'use client';

import { useState } from 'react';
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

type WorkbookSource = {
  id: string;
  filename: string;
  sourceKind: string;
  cutoffDate: string | null;
  senderDeclaredNotFinal: boolean;
  sourceRows: number;
  reviewStatus: string;
  stage: null | {
    rows: number;
    matched: number;
    unresolved: number;
    anomalyRows: number;
    importedAt: string | null;
  };
  updatedAt: string | null;
};

type Response = {
  data: Source[];
  workbooks: WorkbookSource[];
  canImportWorkbooks: boolean;
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
  const { data, error, isLoading, mutate } = useSWR<Response>('/api/finance/sources', fetcher, { revalidateOnFocus: false });
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);

  async function processWorkbook(id: string) {
    setProcessingId(id);
    setProcessingError(null);
    try {
      const response = await fetch(`/api/finance/workbook-imports/${id}/stage`, {
        method: 'POST',
        credentials: 'include',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo procesar la fuente');
      await mutate();
    } catch (processError) {
      setProcessingError(processError instanceof Error ? processError.message : 'No se pudo procesar la fuente');
    } finally {
      setProcessingId(null);
    }
  }

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

      <section className="overflow-hidden rounded-lg border">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Archivos recibidos</h2>
          <p className="mt-1 text-xs text-muted-foreground">Evidencia original conservada. Procesar no publica ni reemplaza activos canónicos.</p>
        </div>
        {processingError ? (
          <div className="border-b border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">{processingError}</div>
        ) : null}
        <div className="divide-y">
          {data.workbooks.length ? data.workbooks.map((workbook) => (
            <article key={workbook.id} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">{workbook.filename}</h3>
                    <Badge variant="outline">{workbook.senderDeclaredNotFinal ? 'Preliminar' : 'Fuente recibida'}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Corte: {date(workbook.cutoffDate)} · {workbook.sourceRows.toLocaleString('es-CL')} filas de origen
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {workbook.stage
                      ? `Procesadas: ${workbook.stage.rows.toLocaleString('es-CL')} · Identidad resuelta: ${workbook.stage.matched.toLocaleString('es-CL')} · Por revisar: ${workbook.stage.unresolved.toLocaleString('es-CL')}`
                      : 'Pendiente de procesamiento estructurado'}
                  </p>
                  {workbook.stage?.anomalyRows ? (
                    <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                      {workbook.stage.anomalyRows.toLocaleString('es-CL')} fila con anomalía de estructura preservada para revisión.
                    </p>
                  ) : null}
                </div>
                {data.canImportWorkbooks ? (
                  <button
                    type="button"
                    onClick={() => processWorkbook(workbook.id)}
                    disabled={processingId !== null}
                    className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {processingId === workbook.id ? 'Procesando…' : workbook.stage ? 'Reprocesar' : 'Procesar'}
                  </button>
                ) : (
                  <Badge variant="secondary">{workbook.reviewStatus === 'needs_review' ? 'Revisión pendiente' : workbook.reviewStatus}</Badge>
                )}
              </div>
            </article>
          )) : (
            <div className="p-4 text-sm text-muted-foreground">No hay archivos financieros registrados.</div>
          )}
        </div>
      </section>

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
