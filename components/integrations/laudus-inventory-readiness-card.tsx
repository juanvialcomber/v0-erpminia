'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { Boxes, GitCompareArrows, History, ScanLine, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Payload = {
  laudus: {
    stockRows: number;
    negativeRows: number;
    kardexRows: number;
  };
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
  motilMovementCount: number;
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

const reconciliationLabel: Record<Payload['reconciliation']['state'], string> = {
  waiting_laudus: 'Esperando Laudus',
  ready_to_compare: 'Lista para comparar',
  review: 'Requiere revisión',
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
          <h2 className="text-sm font-semibold">Preparación de inventario para Laudus</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Laudus aporta saldo ERP como evidencia. El historial de movimientos Laudus todavía no está integrado; los movimientos operacionales de MOTIL se mantienen separados.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : pct(data.stock.productCoverage)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Stock enlazado a producto</p>
        </div>
        <div className="bg-card p-4">
          <ScanLine className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : pct(data.stock.physicalCountCoverage)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Con fecha de conteo físico</p>
        </div>
        <div className="bg-card p-4">
          <History className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : data.motilMovementCount.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Movimientos MOTIL</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Saldo Laudus</p>
          <p className="mt-2 text-lg font-semibold">{isLoading || !data ? '—' : data.laudus.stockRows.toLocaleString('es-CL')} posiciones</p>
          <p className="mt-1 text-xs text-muted-foreground">{isLoading || !data ? '—' : data.laudus.negativeRows.toLocaleString('es-CL')} negativas · Kardex ${isLoading || !data ? '—' : data.laudus.kardexRows.toLocaleString('es-CL')}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <GitCompareArrows className="mt-0.5 h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">
              Conciliación: {isLoading || !data ? '—' : reconciliationLabel[data.reconciliation.state]}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Tolerancia base 0. Una tolerancia distinta requiere aprobación explícita por producto y bodega.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">Conteo físico como evidencia · sin autoajuste</p>
          {data?.reconciliation.state !== 'waiting_laudus' ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/bodega/conciliacion-laudus">Ver conciliación</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
