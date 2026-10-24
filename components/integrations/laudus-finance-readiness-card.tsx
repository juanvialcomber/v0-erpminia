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
  laudusEvidence: {
    available: boolean;
    payableDocuments: number;
    paidDocuments: number;
    partiallyPaidDocuments: number;
    unpaidDocuments: number;
    openDocuments: number;
    creditAdjustments: number;
    stagedPayments: number;
    latestSyncAt: string | null;
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

const stateLabel: Record<Payload['reconciliation']['state'], string> = {
  waiting_laudus: 'Esperando Laudus',
  ready_to_compare: 'Lista para comparar',
  review: 'Requiere revisión',
};

export function LaudusFinanceReadinessCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/finance-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) return null;

  const evidence = data?.laudusEvidence;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Laudus · evidencia financiera</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          MOTIL conserva las CxP operacionales. Laudus aporta evidencia financiera para comparar, no para crear deuda automáticamente.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <WalletCards className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !data ? '—' : data.payables.total.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">CxP canónicas MOTIL</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Documentos Laudus</p>
          <p className="mt-2 text-2xl font-semibold">{isLoading || !evidence?.available ? '—' : evidence.payableDocuments.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Sólo documentos positivos</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Con saldo en Laudus</p>
          <p className="mt-2 text-2xl font-semibold">{isLoading || !evidence?.available ? '—' : evidence.openDocuments.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading || !evidence?.available ? '—' : `${evidence.partiallyPaidDocuments.toLocaleString('es-CL')} parciales · ${evidence.unpaidDocuments.toLocaleString('es-CL')} sin pago`}
          </p>
        </div>
        <div className="bg-card p-4">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading || !evidence?.available ? '—' : evidence.stagedPayments.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Pagos Laudus en staging</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">
            Integración financiera: {isLoading || !data ? '—' : stateLabel[data.reconciliation.state]}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {evidence?.available
              ? `${evidence.creditAdjustments.toLocaleString('es-CL')} ajustes/créditos separados del saldo por pagar.`
              : 'La evidencia Laudus aún no está disponible para esta organización.'}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">Sin creación automática de pagos</p>
      </div>
    </section>
  );
}
