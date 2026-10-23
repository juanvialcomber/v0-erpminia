'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, GitMerge } from 'lucide-react';

type ExceptionRow = {
  purchase_order_id: string;
  order_number: string | null;
  order_date: string | null;
  supplier_name: string | null;
  supplier_resolution_status: string;
  cost_center_resolution_status: string;
  distinct_line_cost_centers: number;
  total_amount: number | null;
  currency: string | null;
};

type Payload = {
  summary: {
    total: number;
    supplier: {
      alreadyLinked: number;
      exactUniqueCandidates: number;
      conflicts: number;
      unresolved: number;
    };
    costCenter: {
      alreadyLinked: number;
      consensusCandidates: number;
      conflicts: number;
      unresolved: number;
    };
    fullyResolvable: number;
  };
  exceptions: ExceptionRow[];
  policy: 'preview_only';
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular conciliación.');
  return payload;
};

const pct = (part: number, total: number) =>
  total ? `${((part / total) * 100).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%` : '0%';

export function LaudusProcurementReconciliationCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/procurement-reconciliation',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (error) return null;

  const total = data?.summary.total || 0;
  const fully = data?.summary.fullyResolvable || 0;
  const supplierOpen =
    (data?.summary.supplier.conflicts || 0) + (data?.summary.supplier.unresolved || 0);
  const ccOpen =
    (data?.summary.costCenter.conflicts || 0) + (data?.summary.costCenter.unresolved || 0);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Conciliación histórica de OC</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Vista previa determinística. No modifica cabeceras, proveedores ni centros de costo.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !data ? '—' : total.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">OC evaluadas</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !data ? '—' : fully.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Completamente resolubles · {isLoading || !data ? '—' : pct(fully, total)}</p>
        </div>
        <div className="bg-card p-4">
          <div className="flex items-center gap-2">
            {supplierOpen === 0 ? <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            <p className="text-2xl font-semibold">{isLoading || !data ? '—' : supplierOpen.toLocaleString('es-CL')}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Proveedor sin resolver</p>
        </div>
        <div className="bg-card p-4">
          <div className="flex items-center gap-2">
            {ccOpen === 0 ? <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
            <p className="text-2xl font-semibold">{isLoading || !data ? '—' : ccOpen.toLocaleString('es-CL')}</p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Centro de costo sin resolver</p>
        </div>
      </div>

      <div className="grid gap-px border-t bg-border md:grid-cols-2">
        <div className="bg-card p-4">
          <p className="text-sm font-medium">Proveedor</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isLoading || !data ? '—' : data.summary.supplier.exactUniqueCandidates.toLocaleString('es-CL')} por nombre exacto y único · {isLoading || !data ? '—' : data.summary.supplier.conflicts.toLocaleString('es-CL')} conflictos.
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="text-sm font-medium">Centro de costo</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isLoading || !data ? '—' : data.summary.costCenter.consensusCandidates.toLocaleString('es-CL')} por consenso de líneas · {isLoading || !data ? '—' : data.summary.costCenter.conflicts.toLocaleString('es-CL')} conflictos.
          </p>
        </div>
      </div>
    </section>
  );
}
