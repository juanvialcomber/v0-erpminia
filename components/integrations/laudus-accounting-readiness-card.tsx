'use client';

import useSWR from 'swr';
import { BookOpenCheck, Landmark, ShieldCheck } from 'lucide-react';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type Payload = {
  ledger: {
    total: number;
    committed: number;
    recognized: number;
    costCenterCoverage: number;
    productCoverage: number;
    assetCoverage: number;
    supplierCoverage: number;
    workOrderCoverage: number;
    amountCoverage: number;
    clpCoverage: number;
  };
  costCenters: {
    canonical: number;
    usedByFinance: number;
    financeUsageCoverage: number;
  };
  assets: {
    canonical: number;
    finance: number;
    exactFinanceMatches: number;
    exactFinanceMatchCoverage: number;
    acquisitionDateCoverage: number;
    acquisitionCostCoverage: number;
    expectedLifespanCoverage: number;
  };
  reconciliation: {
    state: 'waiting_laudus' | 'ready_to_compare' | 'review';
    autoPostAccountingEntries: false;
    autoRewriteLedger: false;
    autoMergeAssets: false;
    humanReviewRequired: true;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular preparación contable.');
  return payload;
};

const pct = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;

const stateLabel: Record<Payload['reconciliation']['state'], string> = {
  waiting_laudus: 'Esperando Laudus',
  ready_to_compare: 'Lista para comparar',
  review: 'Requiere revisión',
};

export function LaudusAccountingReadinessCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/accounting-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (error) return null;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
          <BookOpenCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Preparación contable para Laudus</h2>
          </div>
          <LaudusSourceMark state={isLoading ? 'syncing' : data?.reconciliation.state === 'waiting_laudus' ? 'pending' : 'connected'} />
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          El ledger MOTIL ya separa compromiso de costo reconocido. Laudus se usará para reconciliar y completar evidencia contable, no para reescribir historia operacional.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : data.ledger.total.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Eventos financieros</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Compromisos de compra</p>
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : data.ledger.committed.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Se mantienen separados de gasto reconocido</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Costos reconocidos</p>
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : data.ledger.recognized.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Hechos financieros ya reconocidos</p>
        </div>
        <div className="bg-card p-4">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : pct(data.ledger.costCenterCoverage)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Eventos con centro de costo</p>
        </div>
      </div>

      <div className="grid gap-px border-t bg-border md:grid-cols-4">
        <div className="bg-card p-4">
          <p className="text-sm font-medium">Centros de costo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading || !data ? '—' : data.costCenters.usedByFinance.toLocaleString('es-CL')} usados en Finanzas de {isLoading || !data ? '—' : data.costCenters.canonical.toLocaleString('es-CL')} canónicos.
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="text-sm font-medium">Identidad operacional</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Producto {isLoading || !data ? '—' : pct(data.ledger.productCoverage)} · Activo {isLoading || !data ? '—' : pct(data.ledger.assetCoverage)} · Proveedor {isLoading || !data ? '—' : pct(data.ledger.supplierCoverage)}.
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="text-sm font-medium">Activos financieros</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading || !data ? '—' : data.assets.exactFinanceMatches.toLocaleString('es-CL')} de {isLoading || !data ? '—' : data.assets.finance.toLocaleString('es-CL')} reconciliados por código exacto.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Fecha/costo/vida útil disponibles en {isLoading || !data ? '—' : pct(data.assets.acquisitionCostCoverage)} de los activos canónicos.
          </p>
        </div>
        <div className="bg-card p-4">
          <p className="text-sm font-medium">Conciliación</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading || !data ? '—' : stateLabel[data.reconciliation.state]} · sin contabilización, reescritura ni fusión automática.
          </p>
        </div>
      </div>
    </section>
  );
}
