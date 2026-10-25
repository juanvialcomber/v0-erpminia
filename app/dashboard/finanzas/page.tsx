'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CircleDollarSign, TriangleAlert } from 'lucide-react';
import { useModuleAccess } from '@/hooks/use-module-access';

type Row = Record<string, string | number | null>;

type LaudusReviewItem = {
  purchase_invoice_external_id?: string;
  doc_number?: string | null;
  supplier_name?: string | null;
  due_date?: string | null;
  outstanding_amount?: number | null;
  currency?: string | null;
  days_overdue?: number | null;
  priority_rank?: number | null;
  review_reason?: string | null;
};

type LaudusReview = {
  source?: string;
  read_only?: boolean;
  summary?: {
    invoice_count?: number;
    open_count?: number;
    open_amount?: number;
    overdue_count?: number;
    overdue_amount?: number;
    no_due_date_count?: number;
  };
  reviews?: LaudusReviewItem[];
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
  uniqueInvoices?: number;
};

type InvoicePoCandidate = {
  invoiceExternalId?: string;
  docNumber?: string | null;
  supplierName?: string | null;
  outstandingAmount?: number;
  currency?: string | null;
  orderNumber?: string | null;
  score?: number;
  confidence?: 'strong' | 'review';
  matchedProducts?: number;
  invoiceProducts?: number;
  exactQuantityProducts?: number;
  exactPriceProducts?: number;
};

type NativeTraceResponse = {
  summary?: {
    examined?: number;
    nativeLookups?: number;
    detailRecovered?: number;
    withNativeTrace?: number;
    withConfirmedPo?: number;
    apiCalls?: number;
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
    confirmedPurchaseOrders?: Array<{
      purchaseOrderExternalId?: string;
      orderNumber?: string | null;
      evidence?: string;
    }>;
    unclassifiedTraceCount?: number;
  }>;
  readOnly?: boolean;
};

type InvoicePoControlResponse = {
  summary?: {
    openTotal?: number;
    examined?: number;
    withLines?: number;
    withCandidate?: number;
    strong?: number;
    review?: number;
    exposureExaminedByCurrency?: Record<string, number>;
    candidateExposureByCurrency?: Record<string, number>;
  };
  candidates?: InvoicePoCandidate[];
  readOnly?: boolean;
};

type Response = {
  overview?: Row | null;
  topAssets?: Row[];
  topProducts?: Row[];
  topSuppliers?: Row[];
  topCostCenters?: Row[];
  validation?: Row | null;
  treasury?: Row[];
  treasuryAging?: Row[];
  cashForecast?: Row[];
  laudusReview?: LaudusReview | null;
};

type ConcentrationKey = 'assets' | 'products' | 'suppliers' | 'costCenters';

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar Finanzas');
  return payload;
};

const amount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const money = (value: unknown) =>
  amount(value) === null
    ? '—'
    : new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      }).format(amount(value)!);

const currencyMoney = (value: unknown, currency: unknown) => {
  const numeric = amount(value);
  if (numeric === null) return '—';
  const code =
    typeof currency === 'string' && /^[A-Za-z]{3}$/.test(currency)
      ? currency.toUpperCase()
      : null;
  if (!code) return '—';
  try {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: 0,
    }).format(numeric);
  } catch {
    return `${code} ${new Intl.NumberFormat('es-CL').format(numeric)}`;
  }
};

const number = (value: unknown) =>
  amount(value) === null ? '—' : new Intl.NumberFormat('es-CL').format(amount(value)!);

const shortDate = (value: unknown) => {
  if (typeof value !== 'string' || !value) return 'Sin vencimiento';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha por revisar';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Santiago',
  }).format(date);
};

const concentrationConfig: Record<
  ConcentrationKey,
  { label: string; labelKey: string; amountKey: string }
> = {
  assets: { label: 'Activos', labelKey: 'asset_name', amountKey: 'recognized_clp' },
  products: { label: 'Productos', labelKey: 'product_name', amountKey: 'committed_clp' },
  suppliers: { label: 'Proveedores', labelKey: 'supplier_name', amountKey: 'committed_clp' },
  costCenters: { label: 'Centros de costo', labelKey: 'cost_center_code', amountKey: 'committed_clp' },
};

export default function FinanzasPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/finance/executive', fetcher, {
    refreshInterval: 15 * 60 * 1000,
  });
  const nativeTrace = useSWR<NativeTraceResponse>(
    '/api/integrations/laudus/native-invoice-trace',
    async (url: string) => {
      const response = await fetch(url, { credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar la trazabilidad nativa Laudus.');
      return payload;
    },
    { revalidateOnFocus: false, refreshInterval: 30 * 60 * 1000 },
  );
  const poControl = useSWR<InvoicePoControlResponse>(
    '/api/integrations/laudus/invoice-po-control',
    async (url: string) => {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el control previo al pago.');
      return payload;
    },
    { revalidateOnFocus: false, refreshInterval: 15 * 60 * 1000 },
  );
  const reviewState = useSWR<ReviewFeedbackResponse>(
    '/api/integrations/laudus/finance-review-feedback',
    async (url: string) => {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las revisiones.');
      return payload;
    },
    { revalidateOnFocus: false },
  );
  const { canEdit, ready } = useModuleAccess();
  const [activeConcentration, setActiveConcentration] = useState<ConcentrationKey>('assets');
  const reviewSessionStartedAt = useRef(Date.now());
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);

  const overview = error ? {} : data?.overview || {};
  const treasury = error ? [] : data?.treasury || [];
  const laudus = error ? null : data?.laudusReview || null;
  const laudusSummary = laudus?.summary || {};
  const attention = (laudus?.reviews || []).slice(0, 3);
  const latestReviewByInvoice = new Map(
    (reviewState.data?.reviews || []).map((row) => [row.purchase_invoice_external_id, row]),
  );
  const pendingAttention = attention.filter((item) => {
    const decision = item.purchase_invoice_external_id
      ? latestReviewByInvoice.get(item.purchase_invoice_external_id)?.decision
      : undefined;
    return decision !== 'accepted' && decision !== 'rejected';
  });
  const pendingAttentionAmount = pendingAttention.reduce(
    (sum, item) => sum + Number(item.outstanding_amount || 0),
    0,
  );

  const motilOutstanding = treasury.reduce(
    (sum, row) => sum + Number(row.outstanding_amount || 0),
    0,
  );
  const motilDueSoon = treasury.reduce(
    (sum, row) => sum + Number(row.due_soon_amount || 0),
    0,
  );
  const motilOverdue = treasury.reduce(
    (sum, row) => sum + Number(row.overdue_amount || 0),
    0,
  );

  const rowsByType: Record<ConcentrationKey, Row[]> = error
    ? { assets: [], products: [], suppliers: [], costCenters: [] }
    : {
        assets: data?.topAssets || [],
        products: data?.topProducts || [],
        suppliers: data?.topSuppliers || [],
        costCenters: data?.topCostCenters || [],
      };
  const config = concentrationConfig[activeConcentration];
  const rows = rowsByType[activeConcentration].slice(0, 5);

  const recordReview = async (
    item: LaudusReviewItem,
    decision: 'accepted' | 'rejected' | 'deferred',
  ) => {
    const invoiceId = item.purchase_invoice_external_id;
    if (!invoiceId || reviewingId) return;

    let reason = '';
    if (decision === 'rejected') {
      reason = window.prompt('¿Por qué esta prioridad no aplica?')?.trim() || '';
      if (!reason) return;
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
          reason: reason || null,
          outstandingAmount: amount(item.outstanding_amount),
          decisionLatencyMs: Date.now() - reviewSessionStartedAt.current,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar la revisión.');
      setReviewNotice(
        decision === 'accepted'
          ? 'Revisión registrada.'
          : decision === 'deferred'
            ? 'Caso diferido.'
            : 'Caso marcado como no aplicable.',
      );
      await reviewState.mutate();
    } catch (cause) {
      setReviewNotice(cause instanceof Error ? cause.message : 'No se pudo registrar la revisión.');
    } finally {
      setReviewingId(null);
      setRejectingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Finanzas
          </p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Decisiones financieras</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {pendingAttention.length > 0
              ? `${number(pendingAttention.length)} prioridades requieren revisión por ${money(pendingAttentionAmount)}.`
              : 'No hay prioridades pendientes en la muestra actual.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href="#revisar-prioridades"
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground"
          >
            Revisar prioridades <ArrowRight className="h-4 w-4" />
          </a>
          <Link
            href="/dashboard/valor"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-muted"
          >
            Valor MOTIL
          </Link>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-3">
        {[
          [
            'Saldo abierto',
            money(laudusSummary.open_amount),
            `Laudus · ${number(laudusSummary.open_count)} obligaciones`,
          ],
          [
            'Vencido',
            money(laudusSummary.overdue_amount),
            `${number(laudusSummary.overdue_count)} documentos`,
          ],
          [
            'Compras comprometidas',
            money(overview.committed_clp),
            'Compromisos operacionales',
          ],
        ].map(([label, value, detail]) => (
          <div key={label} className="bg-card px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {isLoading || error ? '—' : value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>

      <section id="revisar-prioridades" className="rounded-lg border">
        <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Revisar ahora</h2>
            <p className="text-sm text-muted-foreground">
              Las tres prioridades de mayor impacto que requieren una decisión.
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs text-muted-foreground">{number(pendingAttention.length)} pendientes</span>
            {reviewNotice ? <p className="mt-1 text-xs text-foreground">{reviewNotice}</p> : null}
          </div>
        </div>
        {isLoading ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">Cargando prioridades…</p>
        ) : attention.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No hay obligaciones Laudus abiertas disponibles para priorizar.
          </p>
        ) : (
          <div>
            {attention.map((item, index) => {
              const priorReview = item.purchase_invoice_external_id
                ? latestReviewByInvoice.get(item.purchase_invoice_external_id)
                : undefined;
              return (
              <div
                key={item.purchase_invoice_external_id || `${item.doc_number}-${index}`}
                className="grid gap-3 border-b px-5 py-4 last:border-b-0 xl:grid-cols-[28px_minmax(0,1fr)_130px_140px_auto] xl:items-center"
              >
                <span className="text-xs font-semibold text-muted-foreground">{index + 1}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {item.supplier_name || 'Proveedor sin identificar'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {item.doc_number ? `Doc. ${item.doc_number} · ` : ''}
                    {item.review_reason || 'Revisión requerida'}
                    {Number(item.days_overdue || 0) > 0 ? ` · ${number(item.days_overdue)} días` : ''}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground md:text-right">
                  {item.due_date ? `Vence ${shortDate(item.due_date)}` : 'Sin vencimiento'}
                </span>
                <span className="text-sm font-semibold tabular-nums xl:text-right">
                  {currencyMoney(item.outstanding_amount, item.currency)}
                </span>
                <div className="flex flex-wrap gap-1.5 xl:justify-end">
                  {priorReview?.decision === 'accepted' ? (
                    <span className="rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground">Revisado</span>
                  ) : null}
                  {priorReview?.decision === 'rejected' ? (
                    <span className="rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground">No aplica</span>
                  ) : null}
                  {priorReview?.decision !== 'accepted' && priorReview?.decision !== 'rejected' ? <button
                    type="button"
                    onClick={() => void recordReview(item, 'accepted')}
                    disabled={!item.purchase_invoice_external_id || reviewingId === item.purchase_invoice_external_id}
                    className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
                  >
                    Revisado
                  </button> : null}
                  <button
                    type="button"
                    onClick={() => void recordReview(item, 'deferred')}
                    disabled={!item.purchase_invoice_external_id || reviewingId === item.purchase_invoice_external_id}
                    className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    Posponer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejectingId(item.purchase_invoice_external_id || null);
                      void recordReview(item, 'rejected');
                    }}
                    disabled={!item.purchase_invoice_external_id || reviewingId === item.purchase_invoice_external_id}
                    className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    {rejectingId === item.purchase_invoice_external_id ? 'Registrando…' : 'No aplica'}
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>



      <section className="rounded-lg border">
        <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Antes de pagar</p>
            <h2 className="mt-1 text-lg font-semibold">Cruce factura / OC</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              MOTIL compara las obligaciones prioritarias con sus órdenes de compra. La decisión sigue siendo de Finanzas.
            </p>
          </div>
          
        </div>
        {nativeTrace.data?.summary?.nativeLookups ? (
          <div className="border-b bg-muted/20 px-5 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-medium">Confirmación Laudus</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Cuando Laudus conoce la relación documental, MOTIL la muestra como evidencia primaria.
                </p>
              </div>
              <span className="text-xs text-muted-foreground">
                {number(nativeTrace.data.summary.withConfirmedPo || 0)} confirmadas · {number(nativeTrace.data.summary.detailRecovered || 0)} detalles recuperados
              </span>
            </div>
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">Cómo se determinó</summary>
              <p className="mt-2 max-w-3xl">
                MOTIL usa primero la relación documental informada por Laudus. Si no existe, compara proveedor, productos, cantidades, precios y fechas para proponer un candidato que siempre requiere revisión humana.
              </p>
            </details>
            {(nativeTrace.data.invoices || []).some((invoice) => (invoice.confirmedPurchaseOrders || []).length > 0) ? (
              <div className="mt-3 space-y-2">
                {(nativeTrace.data.invoices || [])
                  .filter((invoice) => (invoice.confirmedPurchaseOrders || []).length > 0)
                  .slice(0, 3)
                  .map((invoice) => (
                    <div key={invoice.invoiceExternalId} className="flex flex-col gap-1 rounded-md border bg-card px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">
                          Factura {invoice.docNumber || 's/n'} · {invoice.supplierName || 'Proveedor'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          OC confirmada por trazabilidad Laudus: {(invoice.confirmedPurchaseOrders || []).map((order) => order.orderNumber || order.purchaseOrderExternalId).join(', ')}
                        </p>
                      </div>
                      <span className="text-xs font-medium">Confirmado por Laudus</span>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-muted-foreground">
                Laudus aún no confirma una OC para esta muestra. Los demás vínculos se muestran sólo como candidatos para revisión.
              </p>
            )}
          </div>
        ) : null}
        {poControl.error ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">
            El control previo al pago no está disponible en este momento.
          </p>
        ) : !poControl.data ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">Analizando obligaciones prioritarias…</p>
        ) : (
          <div>
            <div className="grid gap-px border-b bg-border sm:grid-cols-3">
              {[
                ['Con OC candidata', number(poControl.data.summary?.withCandidate || 0)],
                [
                  'Falta detalle',
                  number(
                    Math.max(
                      0,
                      Number(poControl.data.summary?.examined || 0) -
                        Number(poControl.data.summary?.withLines || 0),
                    ),
                  ),
                ],
                [
                  'Exposición con candidata',
                  Object.entries(poControl.data.summary?.candidateExposureByCurrency || {}).length === 1
                    ? currencyMoney(
                        Object.values(poControl.data.summary?.candidateExposureByCurrency || {})[0],
                        Object.keys(poControl.data.summary?.candidateExposureByCurrency || {})[0],
                      )
                    : Object.entries(poControl.data.summary?.candidateExposureByCurrency || {}).length === 0
                      ? '—'
                      : `${Object.keys(poControl.data.summary?.candidateExposureByCurrency || {}).length} monedas`,
                ],
              ].map(([label, value]) => (
                <div key={label} className="bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>
            {(poControl.data.candidates || []).slice(0, 3).length === 0 ? (
              <p className="px-5 py-5 text-sm text-muted-foreground">
                No hay candidatas suficientes en las obligaciones analizadas. MOTIL no fuerza una coincidencia.
              </p>
            ) : (
              <div>
                {(poControl.data.candidates || []).slice(0, 3).map((candidate, index) => (
                  <div
                    key={candidate.invoiceExternalId || index}
                    className="grid gap-2 border-b px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_150px_120px_150px] lg:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {candidate.supplierName || 'Proveedor'} · Factura {candidate.docNumber || 's/n'}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        OC candidata {candidate.orderNumber || 's/n'} · {number(candidate.matchedProducts || 0)}/{number(candidate.invoiceProducts || 0)} productos · {number(candidate.exactPriceProducts || 0)} precios exactos
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {candidate.confidence === 'strong' ? 'Alta coincidencia' : 'Revisar'}
                    </span>
                    <span className="text-sm font-semibold tabular-nums lg:text-right">
                      {number(candidate.matchedProducts || 0)}/{number(candidate.invoiceProducts || 0)} productos
                    </span>
                    <span className="text-sm font-semibold tabular-nums lg:text-right">
                      {currencyMoney(candidate.outstandingAmount, candidate.currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {Number(poControl.data.summary?.examined || 0) > Number(poControl.data.summary?.withLines || 0) ? (
              <div className="border-t px-5 py-3 text-xs">
                <span className="font-medium">
                  Falta información en {number(
                    Number(poControl.data.summary?.examined || 0) -
                      Number(poControl.data.summary?.withLines || 0),
                  )} obligaciones prioritarias.
                </span>
                <span className="ml-1 text-muted-foreground">
                  MOTIL no propone una OC sin detalle suficiente.
                </span>
              </div>
            ) : null}
            <p className="border-t px-5 py-3 text-xs text-muted-foreground">
              Una diferencia sólo cuenta como valor cuando Finanzas confirma una corrección antes del pago.
            </p>
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-lg border p-5">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">CxP aprobadas en MOTIL</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Este universo es distinto de la exposición histórica observada en Laudus.
          </p>
          {motilOutstanding > 0 || motilDueSoon > 0 || motilOverdue > 0 ? (
            <>
              <div className="mt-5 grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                <div>
                  <p className="text-xs text-muted-foreground">Saldo</p>
                  <p className="mt-1 text-xl font-semibold">{money(motilOutstanding)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vence ≤ 7 días</p>
                  <p className="mt-1 text-xl font-semibold">{money(motilDueSoon)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Vencido</p>
                  <p className="mt-1 text-xl font-semibold">{money(motilOverdue)}</p>
                </div>
              </div>
              {ready && canEdit('fin_finanzas') ? (
                <Link
                  href="/dashboard/finanzas/pagos"
                  className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
                >
                  Operar pagos <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              ) : null}
            </>
          ) : (
            <div className="mt-4 rounded-md bg-muted/40 px-4 py-3">
              <p className="text-sm font-medium">Sin CxP aprobadas pendientes en MOTIL</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Las obligaciones históricas de Laudus se mantienen separadas de las CxP aprobadas en MOTIL.
              </p>
            </div>
          )}
        </div>

        <div className="rounded-lg border p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Dónde se concentra</h2>
              <p className="text-xs text-muted-foreground">Top 5 del contexto financiero.</p>
            </div>
            <div className="flex flex-wrap gap-1">
              {(Object.keys(concentrationConfig) as ConcentrationKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveConcentration(key)}
                  className={`rounded-md px-2.5 py-1 text-xs ${activeConcentration === key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                >
                  {concentrationConfig[key].label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4">
            {!isLoading && !error && rows.length === 0 ? (
              <p className="py-4 text-sm text-muted-foreground">Sin datos vinculados para este resumen.</p>
            ) : (
              rows.map((row, index) => (
                <div
                  key={`${String(row[config.labelKey])}-${index}`}
                  className="grid grid-cols-[24px_minmax(0,1fr)_130px] items-center gap-2 border-b py-2.5 last:border-b-0"
                >
                  <span className="text-xs text-muted-foreground">{index + 1}</span>
                  <span className="truncate text-sm">{String(row[config.labelKey] || 'Sin identificar')}</span>
                  <span className="text-sm font-semibold tabular-nums text-right">
                    {money(row[config.amountKey])}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      {Number(laudusSummary.no_due_date_count || 0) > 0 ? (
        <section className="flex items-start gap-3 rounded-lg border px-4 py-3 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">
              {number(laudusSummary.no_due_date_count)} obligaciones Laudus no tienen vencimiento.
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              MOTIL las mantiene visibles como excepción; no inventa una fecha.
            </p>
          </div>
        </section>
      ) : null}

      <section className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-4 text-xs text-muted-foreground">
        <Link href="/dashboard/finanzas/trazabilidad" className="hover:text-foreground">Trazabilidad</Link>
        <Link href="/dashboard/finanzas/fuentes" className="hover:text-foreground">Fuentes y calidad</Link>
        <Link href="/dashboard/finanzas/documentos" className="hover:text-foreground">Documentos</Link>
        <Link href="/dashboard/legal" className="hover:text-foreground">Evidencia legal</Link>
        <Link href="/dashboard/finanzas/calendario" className="hover:text-foreground">Calendario</Link>
      </section>
    </div>
  );
}
