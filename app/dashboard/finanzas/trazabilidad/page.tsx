'use client';

import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useModuleAccess } from '@/hooks/use-module-access';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la trazabilidad');
  return payload;
};

const money = (value: unknown) => {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : null;
  if (amount === null) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(amount);
};
const date = (value: unknown) => value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(String(value))) : 'Sin fecha';

type LedgerEvent = {
  event_id: string;
  event_at: string | null;
  recognition_status: string;
  source_table: string;
  source_record_id: string;
  amount?: number | string | null;
  description?: string | null;
};

type ReviewFeedback = {
  purchase_invoice_external_id?: string;
  decision?: 'accepted' | 'rejected' | 'deferred';
  reason?: string | null;
  actor_name?: string | null;
  created_at?: string | null;
};

type ReviewFeedbackResponse = {
  reviews?: ReviewFeedback[];
};

type NativeTraceResponse = {
  summary?: {
    withLines?: number;
    withNativeTrace?: number;
    missingEvidence?: number;
  };
  invoices?: Array<{
    invoiceExternalId?: string;
    docNumber?: string | null;
    supplierName?: string | null;
    outstandingAmount?: number;
    currency?: string | null;
    sourceDetailAvailable?: boolean;
    itemCount?: number;
    nativeTraceCount?: number;
  }>;
  readOnly?: boolean;
};

const number = (value: unknown) => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : null;
  return numeric === null ? '—' : numeric.toLocaleString('es-CL');
};
const currencyMoney = (value: unknown, currency: unknown) => {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : null;
  const code = typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency) ? currency.toUpperCase() : null;
  if (amount === null || !code) return '—';
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency: code, maximumFractionDigits: code === 'CLP' ? 0 : 2 }).format(amount);
  } catch {
    return '—';
  }
};

export default function FinanceTraceabilityPage() {
  const params = useSearchParams();
  const q = params.get('q') || '';
  const status = params.get('status') || 'all';
  const url = `/api/finance/event-ledger?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`;
  const { data, error, isLoading } = useSWR(url, fetcher);
  const nativeTrace = useSWR<NativeTraceResponse>(
    '/api/integrations/laudus/native-invoice-trace',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30 * 60 * 1000 },
  );
  const reviewState = useSWR<ReviewFeedbackResponse>(
    '/api/integrations/laudus/finance-review-feedback',
    fetcher,
    { revalidateOnFocus: false },
  );
  const { canEdit, ready } = useModuleAccess();
  const reviewSessionStartedAt = useRef(Date.now());
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const events: LedgerEvent[] = data?.events || [];
  const missingEvidenceCount = Number(nativeTrace.data?.summary?.missingEvidence || 0);
  const latestReviewByInvoice = new Map(
    (reviewState.data?.reviews || []).map((row) => [row.purchase_invoice_external_id, row]),
  );

  const recordReview = async (
    invoice: NonNullable<NativeTraceResponse['invoices']>[number],
    decision: 'accepted' | 'rejected' | 'deferred',
    reason?: string,
  ) => {
    const invoiceId = invoice.invoiceExternalId?.trim();
    if (!invoiceId || !ready || !canEdit('fin_finanzas')) return;
    if (decision === 'rejected' && !reason?.trim()) {
      setRejectingId(invoiceId);
      return;
    }

    setReviewingId(invoiceId);
    setReviewNotice(null);
    try {
      const response = await fetch('/api/integrations/laudus/finance-review-feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchaseInvoiceExternalId: invoiceId,
          decision,
          reason: reason?.trim() || null,
          outstandingAmount: Number(invoice.outstandingAmount || 0),
          decisionLatencyMs: Date.now() - reviewSessionStartedAt.current,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar la revisión.');
      await reviewState.mutate();
      setRejectingId(null);
      setRejectReason('');
      setReviewNotice(
        decision === 'accepted' ? 'Revisión registrada.' :
        decision === 'deferred' ? 'Caso pospuesto.' :
        'Caso marcado como no aplicable.',
      );
    } catch (cause) {
      setReviewNotice(cause instanceof Error ? cause.message : 'No se pudo registrar la revisión.');
    } finally {
      setReviewingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Finanzas</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Trazabilidad</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Origen, evidencia y revisión humana. Laudus conserva su moneda de origen; MOTIL no completa datos faltantes.
        </p>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card" aria-label="Evidencia de factura Laudus">
        <div className="flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Antes de pagar</p>
            <h2 className="mt-1 text-lg font-semibold">Evidencia de factura</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              MOTIL consulta el detalle y la trazabilidad documental disponible en Laudus. Finanzas mantiene la decisión.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Laudus · solo lectura</span>
        </div>

        {nativeTrace.error ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">
            Laudus no entregó evidencia adicional para esta muestra. La revisión financiera sigue disponible.
          </p>
        ) : !nativeTrace.data ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">Consultando evidencia de las facturas prioritarias…</p>
        ) : (
          <>
            <div className="grid gap-px border-b bg-border sm:grid-cols-3">
              {[
                ['Con líneas', number(nativeTrace.data.summary?.withLines || 0)],
                ['Con traza Laudus', number(nativeTrace.data.summary?.withNativeTrace || 0)],
                ['Falta evidencia', number(nativeTrace.data.summary?.missingEvidence || 0)],
              ].map(([label, value]) => (
                <div key={label} className="bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className={`mt-1 text-lg font-semibold ${label === 'Falta evidencia' && missingEvidenceCount > 0 ? 'text-destructive' : ''}`}>{value}</p>
                </div>
              ))}
            </div>

            <div>
              {(nativeTrace.data.invoices || []).slice(0, 5).map((invoice) => {
                const invoiceId = invoice.invoiceExternalId || '';
                const priorReview = latestReviewByInvoice.get(invoiceId);
                const canReview = ready && canEdit('fin_finanzas') && Boolean(invoiceId);
                return (
                  <div key={invoiceId} className="border-b px-4 py-4 last:border-b-0">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_150px_auto] md:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {invoice.supplierName || 'Proveedor'} · Factura {invoice.docNumber || 's/n'}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {invoice.sourceDetailAvailable
                            ? Number(invoice.itemCount || 0) > 0
                              ? `${number(invoice.itemCount || 0)} líneas recuperadas`
                              : 'Sin líneas en la respuesta'
                            : 'Detalle no disponible en la consulta actual'}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground md:text-right">
                        {Number(invoice.nativeTraceCount || 0) > 0 ? 'Traza Laudus disponible' : 'Falta evidencia'}
                      </span>
                      <span className="text-sm font-semibold tabular-nums md:text-right">
                        {currencyMoney(invoice.outstandingAmount, invoice.currency)}
                      </span>
                      <div className="flex flex-wrap gap-1.5 md:justify-end">
                        {priorReview?.decision === 'accepted' ? <Badge variant="secondary">Revisado</Badge> : null}
                        {priorReview?.decision === 'deferred' ? <Badge variant="outline">Pospuesto</Badge> : null}
                        {priorReview?.decision === 'rejected' ? <Badge variant="outline">No aplica</Badge> : null}
                        {canReview && priorReview?.decision !== 'accepted' ? (
                          <Button
                            size="sm"
                            disabled={reviewingId === invoiceId}
                            onClick={() => void recordReview(invoice, 'accepted')}
                          >
                            Revisado
                          </Button>
                        ) : null}
                        {canReview && priorReview?.decision !== 'deferred' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={reviewingId === invoiceId}
                            onClick={() => void recordReview(invoice, 'deferred')}
                          >
                            Posponer
                          </Button>
                        ) : null}
                        {canReview && priorReview?.decision !== 'rejected' ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={reviewingId === invoiceId}
                            onClick={() => {
                              setRejectingId(invoiceId);
                              setRejectReason('');
                            }}
                          >
                            No aplica
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    {rejectingId === invoiceId ? (
                      <div className="mt-3 rounded-md border bg-muted/20 p-3">
                        <p className="text-xs font-medium">¿Por qué esta prioridad no aplica?</p>
                        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                          <Input
                            value={rejectReason}
                            onChange={(event) => setRejectReason(event.target.value)}
                            placeholder="Razón breve y verificable"
                          />
                          <Button
                            size="sm"
                            disabled={!rejectReason.trim() || reviewingId === invoiceId}
                            onClick={() => void recordReview(invoice, 'rejected', rejectReason)}
                          >
                            Registrar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setRejectingId(null);
                              setRejectReason('');
                            }}
                          >
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
              {reviewNotice ? <p className="border-t px-4 py-3 text-xs text-muted-foreground">{reviewNotice}</p> : null}
            </div>

            <details className="border-t px-4 py-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">Cómo se determinó</summary>
              <p className="mt-2 max-w-3xl">
                MOTIL consulta el detalle y las relaciones documentales que Laudus informa para la factura. Una traza Laudus disponible no se interpreta automáticamente como orden de compra ni como aprobación de pago.
              </p>
              <a href="/dashboard/legal" className="mt-2 inline-block font-medium hover:text-foreground">
                Revisar evidencia legal
              </a>
            </details>
          </>
        )}
      </section>

      {q ? <div className="rounded-lg border p-3 text-sm">Filtro activo: <span className="font-medium">{q}</span></div> : null}
      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando registros...</p> : null}

      <section className="space-y-3" aria-label="Historial financiero">
        <div className="flex items-end justify-between gap-3 border-t pt-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Historial</p>
            <h2 className="mt-1 text-base font-semibold">Eventos financieros</h2>
          </div>
          <p className="hidden text-xs text-muted-foreground sm:block">Fuente y estado por evento</p>
        </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[110px_130px_1fr_150px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
          <span>Fecha</span><span>Estado</span><span>Origen</span><span>Monto</span>
        </div>
        {!isLoading && !events.length ? <p className="p-8 text-center text-sm text-muted-foreground">No hay registros para mostrar.</p> : null}
        {events.map((event) => (
          <div key={event.event_id} className="grid gap-2 border-b px-4 py-4 last:border-0 lg:grid-cols-[110px_130px_1fr_150px] lg:items-center lg:gap-4">
            <p className="text-sm">{date(event.event_at)}</p>
            <Badge variant="outline" className="w-fit">{event.recognition_status === 'recognized' ? 'Reconocido' : 'Comprometido'}</Badge>
            <div className="min-w-0"><p className="truncate text-sm font-medium">{event.description || 'Evento financiero'}</p><p className="text-xs text-muted-foreground">{event.source_table} · fila {event.source_record_id}</p></div>
            <p className="text-sm font-semibold tabular-nums lg:text-right">{money(event.amount)}</p>
          </div>
        ))}
      </div>
      </section>
    </div>
  );
}
