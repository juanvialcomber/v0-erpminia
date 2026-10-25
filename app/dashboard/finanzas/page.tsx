'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, BrainCircuit, CircleDollarSign, Clock3, Sparkles, TriangleAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

type NativeTraceResponse = {
  summary?: {
    examined?: number;
    nativeLookups?: number;
    detailRecovered?: number;
    withLines?: number;
    withNativeTrace?: number;
    missingEvidence?: number;
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
    traceAtItemLevel?: boolean;
    traceAtDocumentLevel?: boolean;
    sourceError?: string | null;
  }>;
  readOnly?: boolean;
};

type ReconciliationItem = {
  date: string | null;
  description: string | null;
  document: string | null;
  amount: number;
};

type BankReconciliation = {
  status: 'available' | 'empty' | 'unavailable';
  bankStatement: { dateFrom: string | null; dateTo: string | null; initialBalance: number | null } | null;
  bankOnly: { count: number; amount: number; items: ReconciliationItem[] };
  journalOnly: { count: number; amount: number; items: ReconciliationItem[] };
  persisted: false;
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

const compactClp = (value: unknown) =>
  amount(value) === null
    ? '—'
    : new Intl.NumberFormat('es-CL', { notation: 'compact', maximumFractionDigits: 1 }).format(amount(value)!);

const daysUntil = (value: unknown) => {
  if (typeof value !== 'string' || !value) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const target = match
    ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0)
    : new Date(value);
  if (Number.isNaN(target.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / 86400000);
};

const shortDate = (value: unknown) => {
  if (typeof value !== 'string' || !value) return 'Sin vencimiento';
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12, 0, 0)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Fecha por revisar';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Santiago',
  }).format(date);
};

const priorityGuidance = (item: LaudusReviewItem) => {
  const overdueDays = Number(item.days_overdue || 0);
  if (overdueDays > 0) {
    return `Vencida hace ${number(overdueDays)} días. Confirmar saldo, vencimiento y respaldo en Laudus antes de decidir.`;
  }
  if (!item.due_date) {
    return 'Sin vencimiento informado. Completar evidencia antes de proyectar caja o priorizar pago.';
  }
  return 'Obligación abierta. Validar respaldo documental y estado vigente en Laudus antes de decidir.';
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
  const bankReconciliation = useSWR<BankReconciliation>(
    '/api/integrations/laudus/bank-reconciliation',
    async (url: string) => {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar la conciliación bancaria Laudus.');
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
  const latestReviewByInvoice = new Map(
    (reviewState.data?.reviews || []).map((row) => [row.purchase_invoice_external_id, row]),
  );
  const pendingAttention = (laudus?.reviews || [])
    .filter((item) => {
      const decision = item.purchase_invoice_external_id
        ? latestReviewByInvoice.get(item.purchase_invoice_external_id)?.decision
        : undefined;
      return decision !== 'accepted' && decision !== 'rejected';
    })
    .slice(0, 3);
  const pendingCurrencies = [
    ...new Set(
      pendingAttention
        .map((item) => String(item.currency || '').trim().toUpperCase())
        .filter(Boolean),
    ),
  ];
  const pendingAttentionAmount = pendingAttention.reduce(
    (sum, item) => sum + Number(item.outstanding_amount || 0),
    0,
  );
  const pendingAttentionValue =
    pendingAttention.length === 0
      ? '—'
      : pendingCurrencies.length === 1
        ? currencyMoney(pendingAttentionAmount, pendingCurrencies[0])
        : `${number(pendingAttention.length)} casos`;

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

  const cashForecast = error ? [] : data?.cashForecast || [];
  const primaryForecast =
    cashForecast.find((row) => String(row.currency || '').toUpperCase() === 'CLP') ||
    cashForecast[0] ||
    null;
  const forecastCurrency = String(primaryForecast?.currency || 'CLP').toUpperCase();
  const cashProjection = primaryForecast
    ? [
        { horizon: 'Vencido', amount: Number(primaryForecast.overdue_amount || 0) },
        { horizon: '≤ 7 días', amount: Number(primaryForecast.due_next_7_amount || 0) },
        { horizon: '≤ 30 días', amount: Number(primaryForecast.due_next_30_amount || 0) },
        { horizon: '≤ 60 días', amount: Number(primaryForecast.due_next_60_amount || 0) },
        { horizon: '≤ 90 días', amount: Number(primaryForecast.due_next_90_amount || 0) },
      ]
    : [];
  const supplierConcentration = (data?.topSuppliers || []).slice(0, 5).map((row) => ({
    supplier: String(row.supplier_name || 'Sin identificar'),
    amount: Number(row.committed_clp || 0),
  }));
  const exposureChart = [
    { label: 'Saldo abierto', amount: Number(laudusSummary.open_amount || 0) },
    { label: 'Vencido', amount: Number(laudusSummary.overdue_amount || 0) },
    { label: 'Prioridad', amount: pendingAttentionAmount },
  ];
  const nextDueDate = typeof primaryForecast?.next_due_date === 'string' ? primaryForecast.next_due_date : null;
  const nextDueDays = daysUntil(nextDueDate);
  const overdueRatio =
    Number(laudusSummary.open_amount || 0) > 0
      ? Number(laudusSummary.overdue_amount || 0) / Number(laudusSummary.open_amount || 0)
      : null;
  const intelligenceSignal =
    Number(laudusSummary.no_due_date_count || 0) > 0
      ? {
          title: 'Forecast incompleto',
          detail: `${number(laudusSummary.no_due_date_count || 0)} obligaciones no tienen vencimiento. Completar esas fechas mejora la proyección de caja.`,
        }
      : overdueRatio !== null && overdueRatio >= 0.5
        ? {
            title: 'Exposición vencida alta',
            detail: `${new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 0 }).format(overdueRatio)} del saldo abierto está vencido. Priorizar concentración y respaldo antes de pagar.`,
          }
        : {
            title: 'Sin señal crítica adicional',
            detail: 'MOTIL seguirá recalculando exposición, vencimientos y evidencia con cada actualización de Laudus.',
          };

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
              ? `${number(pendingAttention.length)} prioridades requieren revisión.`
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
            'Prioridad inmediata',
            pendingAttentionValue,
            `${number(pendingAttention.length)} decisiones por revisar`,
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

      <section className="grid gap-4 xl:grid-cols-[1.4fr_1fr]" aria-label="Control financiero ejecutivo">
        <div className="rounded-lg border p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Control financiero</p>
              <h2 className="mt-1 text-lg font-semibold">Exposición y prioridad</h2>
              <p className="mt-1 text-xs text-muted-foreground">Lectura ejecutiva sobre datos Laudus. No reemplaza la contabilidad.</p>
            </div>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={exposureChart} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickFormatter={(value) => compactClp(Number(value))} tickLine={false} axisLine={false} width={64} fontSize={11} />
                <Tooltip formatter={(value) => [money(Number(value)), 'Monto']} />
                <Bar dataKey="amount" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-lg border p-5">
            <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">ETA financiero</p></div>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {nextDueDays === null ? '—' : nextDueDays < 0 ? `${number(Math.abs(nextDueDays))} días vencido` : nextDueDays === 0 ? 'Hoy' : `${number(nextDueDays)} días`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {nextDueDate ? `Próximo vencimiento registrado: ${shortDate(nextDueDate)}` : 'Sin próximo vencimiento disponible en el forecast.'}
            </p>
          </div>

          <div className="rounded-lg border p-5">
            <div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Inteligencia MOTIL</p></div>
            <p className="mt-3 text-base font-semibold">{intelligenceSignal.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{intelligenceSignal.detail}</p>
            <p className="mt-3 text-xs text-muted-foreground">Señal explicable · recalculada desde evidencia financiera</p>
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-medium">Predicción estadística</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                En calibración. MOTIL separa primero operación real de cargas históricas extraordinarias antes de proyectar tendencia. Mientras tanto, la caja a 90 días usa vencimientos reales y no estimaciones.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2" aria-label="Proyecciones financieras">
        <div className="rounded-lg border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Proyección</p>
            <h2 className="mt-1 text-lg font-semibold">Caja a 90 días</h2>
            <p className="mt-1 text-xs text-muted-foreground">Obligaciones por horizonte de vencimiento · {forecastCurrency}. Es forecast contractual, no predicción estadística.</p>
          </div>
          {cashProjection.length === 0 ? (
            <p className="py-10 text-sm text-muted-foreground">Sin obligaciones con vencimiento suficiente para proyectar.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashProjection} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="horizon" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickFormatter={(value) => compactClp(Number(value))} tickLine={false} axisLine={false} width={64} fontSize={11} />
                  <Tooltip formatter={(value) => [currencyMoney(Number(value), forecastCurrency), 'Obligaciones']} />
                  <Bar dataKey="amount" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="rounded-lg border p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Concentración</p>
            <h2 className="mt-1 text-lg font-semibold">Compromiso por proveedor</h2>
            <p className="mt-1 text-xs text-muted-foreground">Top 5 por compromiso registrado en MOTIL.</p>
          </div>
          {supplierConcentration.length === 0 ? (
            <p className="py-10 text-sm text-muted-foreground">Sin concentración de proveedores disponible.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierConcentration} layout="vertical" margin={{ top: 8, right: 8, left: 12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => compactClp(Number(value))} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis type="category" dataKey="supplier" width={120} tickLine={false} axisLine={false} fontSize={11} />
                  <Tooltip formatter={(value) => [money(Number(value)), 'Compromiso']} />
                  <Bar dataKey="amount" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
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
        ) : pendingAttention.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground">
            No hay obligaciones Laudus abiertas disponibles para priorizar.
          </p>
        ) : (
          <div>
            {pendingAttention.map((item, index) => {
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
                  </p>
                  <p className="mt-1 text-xs text-foreground/80">
                    <span className="font-medium">Qué revisar:</span> {priorityGuidance(item)}
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
            <h2 className="mt-1 text-lg font-semibold">Evidencia de factura</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              MOTIL consulta directamente el detalle y la trazabilidad documental disponible en Laudus. Finanzas mantiene la decisión.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Solo lectura</span>
        </div>

        {nativeTrace.error ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">
            Laudus no entregó evidencia adicional para esta muestra. Las prioridades siguen disponibles para revisión.
          </p>
        ) : !nativeTrace.data ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">
            Consultando evidencia de las facturas prioritarias…
          </p>
        ) : (
          <div>
            <div className="grid gap-px border-b bg-border sm:grid-cols-3">
              {[
                ['Con líneas', number(nativeTrace.data.summary?.withLines || 0)],
                ['Con traza Laudus', number(nativeTrace.data.summary?.withNativeTrace || 0)],
                ['Falta evidencia', number(nativeTrace.data.summary?.missingEvidence || 0)],
              ].map(([label, value]) => (
                <div key={label} className="bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-lg font-semibold">{value}</p>
                </div>
              ))}
            </div>

            <div>
              {(nativeTrace.data.invoices || []).slice(0, 3).map((invoice) => (
                <div
                  key={invoice.invoiceExternalId}
                  className="grid gap-2 border-b px-5 py-4 last:border-b-0 md:grid-cols-[minmax(0,1fr)_150px_150px] md:items-center"
                >
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
                    {Number(invoice.nativeTraceCount || 0) > 0
                      ? 'Traza Laudus disponible'
                      : 'Falta evidencia'}
                  </span>
                  <span className="text-sm font-semibold tabular-nums md:text-right">
                    {currencyMoney(invoice.outstandingAmount, invoice.currency)}
                  </span>
                </div>
              ))}
            </div>

            <details className="border-t px-5 py-3 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                Cómo se determinó
              </summary>
              <p className="mt-2 max-w-3xl">
                MOTIL consulta el detalle y las relaciones documentales que Laudus informa para la factura. Una traza disponible no se interpreta automáticamente como orden de compra ni como aprobación de pago.
              </p>
            </details>
          </div>
        )}
      </section>

      <section className="rounded-lg border">
        <div className="flex flex-col gap-2 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Control Laudus</p>
            <h2 className="mt-1 text-lg font-semibold">Conciliación bancaria</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              MOTIL compara la última cartola disponible con la contabilidad Laudus y muestra sólo las diferencias que requieren revisión.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">Solo lectura</span>
        </div>

        {bankReconciliation.error ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">
            Laudus no entregó la conciliación en este momento. MOTIL no interpreta la ausencia como cero diferencias.
          </p>
        ) : !bankReconciliation.data ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">Comparando cartola y contabilidad Laudus…</p>
        ) : bankReconciliation.data.status === 'empty' ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">No hay cartolas Laudus disponibles para comparar.</p>
        ) : bankReconciliation.data.status === 'unavailable' ? (
          <p className="px-5 py-5 text-sm text-muted-foreground">La conciliación Laudus no está disponible.</p>
        ) : (
          <div>
            <div className="grid gap-px border-b bg-border sm:grid-cols-2">
              <div className="bg-card px-5 py-4">
                <p className="text-xs text-muted-foreground">En cartola, no en contabilidad</p>
                <p className="mt-1 text-2xl font-semibold">{number(bankReconciliation.data.bankOnly.count)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{money(bankReconciliation.data.bankOnly.amount)} por revisar</p>
              </div>
              <div className="bg-card px-5 py-4">
                <p className="text-xs text-muted-foreground">En contabilidad, no en cartola</p>
                <p className="mt-1 text-2xl font-semibold">{number(bankReconciliation.data.journalOnly.count)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{money(bankReconciliation.data.journalOnly.amount)} por revisar</p>
              </div>
            </div>

            {(bankReconciliation.data.bankOnly.items.length > 0 || bankReconciliation.data.journalOnly.items.length > 0) ? (
              <div className="grid gap-px bg-border lg:grid-cols-2">
                {[
                  ['Cartola sin contabilidad', bankReconciliation.data.bankOnly.items],
                  ['Contabilidad sin cartola', bankReconciliation.data.journalOnly.items],
                ].map(([title, items]) => (
                  <div key={String(title)} className="bg-card">
                    <div className="border-b px-5 py-3"><h3 className="text-sm font-semibold">{String(title)}</h3></div>
                    {(items as ReconciliationItem[]).map((item, index) => (
                      <div key={`${String(title)}-${index}`} className="grid gap-1 border-b px-5 py-3 last:border-b-0 sm:grid-cols-[90px_1fr_130px] sm:items-center">
                        <span className="text-xs text-muted-foreground">{item.date ? shortDate(item.date) : 'Sin fecha'}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{item.description || 'Sin descripción'}</p>
                          <p className="truncate text-xs text-muted-foreground">{item.document || 'Sin documento'}</p>
                        </div>
                        <span className="text-sm font-semibold tabular-nums sm:text-right">{money(item.amount)}</span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}

            {bankReconciliation.data.bankStatement ? (
              <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                Fuente: Laudus · última cartola disponible · {shortDate(bankReconciliation.data.bankStatement.dateFrom)} → {shortDate(bankReconciliation.data.bankStatement.dateTo)}.
              </p>
            ) : null}
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
