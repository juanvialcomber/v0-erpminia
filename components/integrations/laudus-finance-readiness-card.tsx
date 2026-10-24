'use client';

import useSWR from 'swr';
import {
  AlertTriangle,
  BookOpenCheck,
  CheckCircle2,
  Landmark,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';

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
  accountingEvidence: {
    available: boolean;
    accountingEntries: number;
    bankStatements: number;
    pendingDtes: number;
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
  waiting_laudus: 'Esperando datos',
  ready_to_compare: 'Operativo',
  review: 'Revisar',
};

function freshness(value: string | null | undefined) {
  if (!value) return 'Sin sincronización';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Sin sincronización';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function LaudusFinanceReadinessCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/finance-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) return null;

  const evidence = data?.laudusEvidence;
  const accounting = data?.accountingEvidence;
  const state = data?.reconciliation.state ?? 'waiting_laudus';
  const hasOpenDocuments = Boolean(evidence?.openDocuments);
  const hasPendingDtes = Boolean(accounting?.pendingDtes);
  const nextAction = hasOpenDocuments
    ? 'Priorizar obligaciones con saldo y validar proveedor.'
    : hasPendingDtes
      ? 'Revisar DTE pendientes antes del cierre.'
      : accounting?.available
        ? 'Sin excepciones financieras urgentes.'
        : 'Completar primera sincronización Laudus.';

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex flex-col gap-4 border-b px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Landmark className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Centro de control financiero</h2>
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium">
              {state === 'ready_to_compare' ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
              {isLoading || !data ? 'Cargando' : stateLabel[state]}
            </span>
          </div>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            MOTIL cruza operación y evidencia Laudus sin convertir automáticamente documentos externos en deuda, pago o asiento canónico.
          </p>
        </div>
        <div className="text-left lg:text-right">
          <p className="text-xs text-muted-foreground">Última evidencia</p>
          <p className="mt-1 text-sm font-medium">{isLoading ? '—' : freshness(accounting?.latestSyncAt || evidence?.latestSyncAt)}</p>
        </div>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-5">
          <WalletCards className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {isLoading || !evidence?.available ? '—' : evidence.openDocuments.toLocaleString('es-CL')}
          </p>
          <p className="mt-1 text-xs font-medium">Obligaciones con saldo</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {isLoading || !evidence?.available
              ? 'Sin evidencia'
              : `${evidence.partiallyPaidDocuments.toLocaleString('es-CL')} parciales · ${evidence.unpaidDocuments.toLocaleString('es-CL')} sin pago`}
          </p>
        </div>

        <div className="bg-card p-5">
          <BookOpenCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {isLoading || !accounting?.available ? '—' : accounting.accountingEntries.toLocaleString('es-CL')}
          </p>
          <p className="mt-1 text-xs font-medium">Comprobantes contables</p>
          <p className="mt-1 text-xs text-muted-foreground">Evidencia disponible para conciliación.</p>
        </div>

        <div className="bg-card p-5">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {isLoading || !accounting?.available ? '—' : accounting.bankStatements.toLocaleString('es-CL')}
          </p>
          <p className="mt-1 text-xs font-medium">Cartolas bancarias</p>
          <p className="mt-1 text-xs text-muted-foreground">Fuente bancaria separada de la aprobación MOTIL.</p>
        </div>

        <div className="bg-card p-5">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-3 text-3xl font-semibold tracking-tight">
            {isLoading || !accounting?.available ? '—' : accounting.pendingDtes.toLocaleString('es-CL')}
          </p>
          <p className="mt-1 text-xs font-medium">DTE pendientes</p>
          <p className="mt-1 text-xs text-muted-foreground">Excepción fiscal visible, no acción automática.</p>
        </div>
      </div>

      <div className="grid gap-px border-t bg-border lg:grid-cols-[1.3fr_1fr_1fr]">
        <div className="bg-card px-5 py-4">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Siguiente acción</p>
          <p className="mt-2 text-sm font-medium">{isLoading ? 'Calculando…' : nextAction}</p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Cobertura operativa</p>
          <p className="mt-1 text-sm font-medium">
            {isLoading || !data ? '—' : `${data.payables.total.toLocaleString('es-CL')} CxP MOTIL · ${evidence?.payableDocuments.toLocaleString('es-CL') ?? '—'} documentos Laudus`}
          </p>
        </div>
        <div className="bg-card px-5 py-4">
          <p className="text-xs text-muted-foreground">Autoridad</p>
          <p className="mt-1 text-sm font-medium">MOTIL propone · humano aprueba</p>
        </div>
      </div>
    </section>
  );
}
