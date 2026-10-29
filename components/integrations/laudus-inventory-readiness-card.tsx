'use client';

import useSWR from 'swr';
import { Boxes, GitCompareArrows, History, ShieldCheck, Warehouse } from 'lucide-react';

type Payload = {
  stock: {
    rows: number;
    productCoverage: number;
    physicalCountCoverage: number;
  };
  snapshot: {
    rows: number;
    warehouseCoverage: number;
    latestDate: string | null;
    negativeRows: number;
  };
  movementCount: number;
  laudus: {
    products: number;
    canonicalProductCoverage: number;
    stockRows: number;
    warehouses: number;
    physicalWarehouses: number;
    mappedPhysicalWarehouses: number;
    latestStockSync: string | null;
    openReconciliation: number;
  };
  reconciliation: {
    state: 'waiting_laudus' | 'ready_to_compare' | 'review';
    defaultAbsoluteTolerance: number;
    requiresApprovedTolerance: boolean;
    physicalCountUsedAsEvidence: boolean;
    autoApply: false;
  };
  policy: {
    laudusStockRole: 'erp_evidence';
    motilOperationalStockRole: 'operational_truth';
    autoOverwrite: false;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular preparación de inventario.');
  return payload;
};

const pct = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;
const count = (value: number) => value.toLocaleString('es-CL');
const dateTime = (value: string | null) => value
  ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(value))
  : 'Sin sincronización';

const reconciliationLabel: Record<Payload['reconciliation']['state'], string> = {
  waiting_laudus: 'Esperando datos Laudus',
  ready_to_compare: 'Sincronizado',
  review: 'Sincronizado · requiere revisión',
};

export function LaudusInventoryReadinessCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/inventory-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) return null;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Laudus · inventario ERP</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Laudus aporta catálogo, stock ERP y bodegas como evidencia. MOTIL conserva por separado el stock operacional y nunca lo reemplaza automáticamente.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : pct(data.laudus.canonicalProductCoverage)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Productos Laudus enlazados al catálogo</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{isLoading || !data ? '—' : count(data.laudus.products)} productos fuente</p>
        </div>
        <div className="bg-card p-4">
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : count(data.laudus.stockRows)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Posiciones producto-bodega Laudus</p>
        </div>
        <div className="bg-card p-4">
          <Warehouse className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : `${data.laudus.mappedPhysicalWarehouses}/${data.laudus.physicalWarehouses}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">Bodegas físicas conciliadas con MOTIL</p>
        </div>
        <div className="bg-card p-4">
          <History className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-sm font-semibold">{isLoading || !data ? '—' : dateTime(data.laudus.latestStockSync)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Última evidencia de stock Laudus</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <GitCompareArrows className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              Estado: {isLoading || !data ? '—' : reconciliationLabel[data.reconciliation.state]}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isLoading || !data
                ? 'Verificando conciliación.'
                : data.laudus.openReconciliation > 0
                  ? `${count(data.laudus.openReconciliation)} registro(s) del ledger de integración siguen abiertos; no bloquean la lectura del stock fuente.`
                  : 'Sin pendientes abiertos en el ledger de integración.'}
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Evidencia ERP · sin autoajuste de stock MOTIL
        </p>
      </div>
    </section>
  );
}
