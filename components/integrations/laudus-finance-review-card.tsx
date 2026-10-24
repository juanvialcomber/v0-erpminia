'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useModuleAccess } from '@/hooks/use-module-access';

type QueueRow = {
  id: string;
  documentNumber: string | null;
  supplierName: string | null;
  supplierMatched: boolean;
  motilSupplierId: string | null;
  motilSupplierName: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  outstandingAmount: number;
  paymentStatus: string | null;
  overdueDays: number;
  priorityScore: number;
  priority: 'high' | 'medium' | 'low';
  scoreBreakdown: {
    age: number;
    amount: number;
    payment: number;
    identity: number;
  };
  evidence: string[];
  nextAction: string;
  feedback: {
    decision: string;
    reason: string | null;
    actorName: string | null;
    createdAt: string;
  } | null;
};

type Payload = {
  summary: {
    openDocuments: number;
    matchedSupplierDocuments: number;
    unresolvedSupplierDocuments: number;
    overdueDocuments: number;
    highPriorityDocuments: number;
    highPriorityAmount: number;
    highPriorityAmountShare: number;
    outstandingTotal: number;
    supplierCoverage: number;
  };
  feedbackAvailable: boolean;
  queue: QueueRow[];
  method: {
    identity: string;
    ranking: string;
    poMatching: string;
    automaticPromotion: false;
    humanReviewRequired: true;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la revisión financiera.');
  return payload;
};

const money = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(value);

const priorityLabel: Record<QueueRow['priority'], string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const feedbackLabel: Record<string, string> = {
  accepted: 'Coincide',
  rejected: 'No coincide',
  deferred: 'Pendiente',
};

export function LaudusFinanceReviewCard() {
  const { canEdit, ready } = useModuleAccess();
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/integrations/laudus/finance-review',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );
  const [activeRejectId, setActiveRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) return null;

  const summary = data?.summary;
  const canReview = ready && canEdit('fin_finanzas') && Boolean(data?.feedbackAvailable);

  const submitFeedback = async (
    row: QueueRow,
    decision: 'accepted' | 'rejected',
    reason?: string,
  ) => {
    setSavingId(row.id);
    setActionError(null);

    try {
      const response = await fetch('/api/integrations/laudus/finance-review/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          purchaseInvoiceExternalId: row.id,
          suggestedSupplierId: row.motilSupplierId,
          decision,
          reason: reason || null,
          priorityScore: row.priorityScore,
          outstandingAmount: row.outstandingAmount,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar la revisión.');

      setActiveRejectId(null);
      setRejectReason('');
      await mutate();
    } catch (feedbackError) {
      setActionError(
        feedbackError instanceof Error
          ? feedbackError.message
          : 'No se pudo registrar la revisión.',
      );
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Revisión priorizada de obligaciones</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          MOTIL ordena qué revisar primero usando vencimiento, saldo, estado de pago e identidad del proveedor. No crea CxP automáticamente.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !summary ? '—' : summary.openDocuments.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Documentos con saldo</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !summary ? '—' : summary.supplierCoverage.toLocaleString('es-CL', { maximumFractionDigits: 1 }) + '%'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Proveedor identificado</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !summary ? '—' : summary.overdueDocuments.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Con vencimiento pasado</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !summary ? '—' : money(summary.outstandingTotal)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Saldo fuente Laudus</p>
        </div>
      </div>

      <div className="border-t px-4 py-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium">Primero revisar</p>
            <p className="text-xs text-muted-foreground">
              Casos de mayor impacto y antigüedad. La evidencia se presenta antes de cualquier decisión.
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {isLoading || !summary
              ? '—'
              : `${summary.highPriorityDocuments.toLocaleString('es-CL')} prioridad alta · ${summary.highPriorityAmountShare.toLocaleString('es-CL', { maximumFractionDigits: 1 })}% del saldo`}
          </p>
        </div>

        {actionError ? (
          <p className="mt-3 text-xs text-destructive">{actionError}</p>
        ) : null}

        <div className="mt-3 divide-y rounded-lg border">
          {isLoading ? <p className="p-4 text-sm text-muted-foreground">Priorizando evidencia…</p> : null}
          {!isLoading && data?.queue.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No hay obligaciones Laudus pendientes de revisión.</p>
          ) : null}
          {data?.queue.slice(0, 5).map((row) => (
            <div key={row.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {row.supplierName || 'Proveedor sin nombre'} · {row.documentNumber || 'Documento sin número'}
                  </p>
                  <Badge variant="outline">{priorityLabel[row.priority]}</Badge>
                  {row.supplierMatched ? (
                    <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Proveedor identificado</Badge>
                  ) : (
                    <Badge variant="outline"><AlertTriangle className="mr-1 h-3.5 w-3.5" />Identidad pendiente</Badge>
                  )}
                  {row.feedback ? (
                    <Badge variant="outline">
                      {feedbackLabel[row.feedback.decision] || row.feedback.decision}
                    </Badge>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saldo {money(row.outstandingAmount)} · {row.overdueDays > 0 ? row.overdueDays.toLocaleString('es-CL') + ' días vencido' : 'no vencido'} · {row.paymentStatus === 'partially_paid' ? 'pago parcial' : 'sin pago aplicado'}
                </p>
                <p className="mt-1 text-xs">{row.nextAction}</p>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Score: antigüedad +{row.scoreBreakdown.age} · monto +{row.scoreBreakdown.amount} · pago +{row.scoreBreakdown.payment} · identidad +{row.scoreBreakdown.identity}
                </p>

                {canReview && row.supplierMatched && !row.feedback ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingId === row.id}
                      onClick={() => submitFeedback(row, 'accepted')}
                    >
                      Coincide
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={savingId === row.id}
                      onClick={() => {
                        setActiveRejectId(row.id);
                        setRejectReason('');
                        setActionError(null);
                      }}
                    >
                      No coincide
                    </Button>
                  </div>
                ) : null}

                {canReview && row.supplierMatched && !row.feedback && activeRejectId === row.id ? (
                  <div className="mt-2 flex max-w-xl flex-col gap-2 sm:flex-row">
                    <Input
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      placeholder="Motivo breve"
                      maxLength={240}
                    />
                    <Button
                      size="sm"
                      disabled={!rejectReason.trim() || savingId === row.id}
                      onClick={() => submitFeedback(row, 'rejected', rejectReason.trim())}
                    >
                      Registrar
                    </Button>
                  </div>
                ) : null}

                {row.feedback ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Revisión registrada
                    {row.feedback.actorName ? ' por ' + row.feedback.actorName : ''}
                    {row.feedback.reason ? ' · ' + row.feedback.reason : ''}
                  </p>
                ) : null}
              </div>
              <div className="text-left lg:text-right">
                <p className="text-xs text-muted-foreground">Prioridad</p>
                <p className="text-lg font-semibold tabular-nums">{row.priorityScore}/100</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
