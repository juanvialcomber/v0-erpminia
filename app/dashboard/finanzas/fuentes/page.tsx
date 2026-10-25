'use client';

import useSWR from 'swr';
import { Database } from 'lucide-react';
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
  if (!response.ok) throw new Error('No se pudo cargar el origen de los datos. Inténtalo de nuevo.');
  return payload as Response;
};

function date(value: string | null) {
  return value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(value)) : 'Sin fecha';
}

function sourceTitle(source: Source) {
  if (source.sourceTable === 'canonical.asset_costs') return 'Gastos asociados a equipos';
  if (source.sourceTable === 'canonical.purchase_order_lines') return 'Órdenes de compra';
  return source.label;
}

function sourceStatus(source: Source) {
  return source.recognitionStatus === 'recognized' ? 'Gasto registrado' : 'Compra ordenada';
}

function currencyName(currency: string) {
  const names: Record<string, string> = {
    CLP: 'pesos chilenos',
    USD: 'dólares estadounidenses',
    EUR: 'euros',
    ARS: 'pesos argentinos',
    PEN: 'soles peruanos',
  };
  return names[currency.trim().toUpperCase()] || 'la moneda informada';
}

export default function FinanceSourcesPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/finance/sources', fetcher, { revalidateOnFocus: false });

  if (isLoading) return <StatePanel tone="loading" title="Cargando el origen de los datos" description="Revisando los registros de compras y gastos." />;
  if (error || !data) return <StatePanel tone="error" title="No se pudo cargar el origen de los datos" description="Inténtalo de nuevo más tarde." />;

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Finanzas · Origen de los datos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">De dónde salen los montos</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Aquí puedes ver qué registros respaldan los gastos y las órdenes de compra. Los archivos que subas se guardan por separado y no cambian este historial.
        </p>
      </header>

      <section className="grid overflow-hidden rounded-lg border sm:grid-cols-4">
        {[
          ['Registros de compras y gastos', data.summary.auditEvents],
          ['Gastos registrados', data.summary.recognizedEvents],
          ['Órdenes de compra', data.summary.committedEvents],
          ['Archivos de Finanzas', data.summary.documentCoreRecords],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{Number(value).toLocaleString('es-CL')}</p>
          </div>
        ))}
      </section>

      {data.summary.documentCoreRecords === 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm font-medium">El historial anterior proviene de registros de compras y gastos, no de archivos cargados aquí.</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Los archivos nuevos se guardan por separado y no modifican los movimientos anteriores.
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
                  <h2 className="text-sm font-semibold">{sourceTitle(source)}</h2>
                  <Badge variant="secondary">{sourceStatus(source)}</Badge>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {source.records.toLocaleString('es-CL')} registros · montos en {currencyName(source.currency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Desde {date(source.firstEventAt)} hasta {date(source.lastEventAt)}
                </p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
