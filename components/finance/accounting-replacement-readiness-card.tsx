'use client';

import useSWR from 'swr';
import { BookOpenCheck } from 'lucide-react';

type Payload = {
  authorityTarget: 'MOTIL_MANAGEMENT_LEDGER';
  laudusRoleTarget: 'financial_source_reference';
  status: 'ready' | 'backfill_required';
  source: {
    totalEntries: number;
    entriesWithLines: number;
    lineRows: number;
    coveragePct: number;
    withAccount: number;
    withCurrency: number;
    withCostCenter: number;
    withDescription: number;
    withDocument: number;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular reemplazo contable.');
  return payload;
};

const pct = (value: number) => `${Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;

export function AccountingReplacementReadinessCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/finance/accounting-replacement-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) return null;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-4 border-b px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpenCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Reemplazo contable</h2>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Laudus permanece como evidencia financiera mientras MOTIL completa las dimensiones de línea necesarias para gestión. No se contabiliza ni reescribe historia operacional automáticamente.
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">
          {isLoading || !data ? 'Calculando' : data.status === 'ready' ? 'Cobertura completa' : 'Backfill pendiente'}
        </span>
      </div>

      {data ? (
        <>
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Asientos fuente" value={data.source.totalEntries.toLocaleString('es-CL')} />
            <Metric label="Con líneas útiles" value={data.source.entriesWithLines.toLocaleString('es-CL')} />
            <Metric label="Cobertura" value={pct(data.source.coveragePct)} />
            <Metric label="Líneas recuperadas" value={data.source.lineRows.toLocaleString('es-CL')} />
          </div>
          <div className="grid gap-px border-t bg-border sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Con cuenta" value={data.source.withAccount.toLocaleString('es-CL')} compact />
            <Metric label="Con moneda" value={data.source.withCurrency.toLocaleString('es-CL')} compact />
            <Metric label="Con centro" value={data.source.withCostCenter.toLocaleString('es-CL')} compact />
            <Metric label="Con descripción" value={data.source.withDescription.toLocaleString('es-CL')} compact />
            <Metric label="Con documento" value={data.source.withDocument.toLocaleString('es-CL')} compact />
          </div>
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <div className="bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={compact ? 'mt-1 text-base font-semibold' : 'mt-2 text-2xl font-semibold'}>{value}</p>
    </div>
  );
}
