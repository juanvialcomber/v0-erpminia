'use client';

import useSWR from 'swr';
import { Landmark, ShieldCheck, WalletCards } from 'lucide-react';

type Payload = {
  payables: {
    total: number;
    invoiceCoverage: number;
    supplierCoverage: number;
    amountCoverage: number;
    dueDateCoverage: number;
    currencyCoverage: number;
  };
  payments: {
    total: number;
    payableCoverage: number;
    amountCoverage: number;
    dateCoverage: number;
    currencyCoverage: number;
    reconciliationCoverage: number;
  };
  approvals: {
    paymentRequests: number;
    paymentSignatures: number;
  };
  reconciliation: {
    state: 'waiting_laudus' | 'ready_to_compare' | 'review';
    autoCreatePayment: false;
    autoReconcilePayment: false;
    humanApprovalRequired: true;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular preparación financiera.');
  return payload;
};

const pct = (value: number) => `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;

const stateLabel: Record<Payload['reconciliation']['state'], string> = {
  waiting_laudus: 'Esperando Laudus',
  ready_to_compare: 'Lista para comparar',
  review: 'Requiere revisión',
};

export function LaudusFinanceReadinessCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/finance-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (error) return null;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Preparación financiera para Laudus</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Laudus podrá aportar CxP, pagos y evidencia contable. MOTIL conserva aprobación humana y conciliación trazable.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <WalletCards className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : data.payables.total.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Cuentas por pagar</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">CxP con vencimiento</p>
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : pct(data.payables.dueDateCoverage)}</p>
          <p className="mt-1 text-xs text-muted-foreground">No se infiere fecha faltante</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Pagos registrados</p>
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : data.payments.total.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{isLoading || !data ? '—' : pct(data.payments.payableCoverage)} enlazados a CxP</p>
        </div>
        <div className="bg-card p-4">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : pct(data.payments.reconciliationCoverage)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Pagos conciliados</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">
            Integración financiera: {isLoading || !data ? '—' : stateLabel[data.reconciliation.state]}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Laudus puede informar hechos financieros; no puede aprobar, crear ni conciliar pagos automáticamente.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Aprobación humana obligatoria</p>
      </div>
    </section>
  );
}
