'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, BrainCircuit, CircleDollarSign, Clock3, TriangleAlert } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useModuleAccess } from '@/hooks/use-module-access';
import { LaudusFinanceControlCard } from '@/components/integrations/laudus-finance-control-card';

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
  laudusAging?: Array<{ bucket?: string; invoices?: number; amount?: number }>;
  laudusSupplierPressure?: Array<{
    supplier?: string;
    invoices?: number;
    outstanding?: number;
    overdue?: number;
    maxDaysOverdue?: number;
  }>;
  laudusPressureTrajectory?: Array<{
    label?: string;
    days?: number;
    current?: number;
    overdue?: number;
    olderThan90?: number;
    noDueDate?: number;
  }>;
  assetEconomics?: Array<{
    laudusExternalId?: string | null;
    laudusName?: string | null;
    canonicalAssetId?: string | null;
    canonicalAssetCode?: string | null;
    canonicalAssetName?: string | null;
    evidenceLevel?: string | null;
    exactPlateSupport?: boolean;
    exactSerialSupport?: boolean;
    acquisitionDate?: string | null;
    usefulLifeYears?: number | null;
    lifeConsumedPct?: number | null;
    estimatedRetirementDate?: string | null;
    depreciationType?: string | null;
    acquisitionCost?: number | null;
    realizableValue?: number | null;
    depreciationStatus?: string | null;
    annualDepreciation?: number | null;
    accumulatedDepreciation?: number | null;
    estimatedBookValue?: number | null;
    costRecoveryStatus?: string | null;
    maintenanceCost?: number | null;
    maintenanceMovements?: number | null;
    lastMaintenanceCostDate?: string | null;
  }>;
  assetReconciliationOpportunities?: Array<{
    canonicalAssetId?: string | null;
    canonicalAssetCode?: string | null;
    canonicalAssetName?: string | null;
    candidateCount?: number;
    exactIdentifierCount?: number;
    evidenceLevels?: string[];
    laudusNames?: string[];
    maintenanceCost?: number;
    maintenanceMovements?: number;
    lastMaintenanceCostDate?: string | null;
    imageUrl?: string | null;
  }>;
  assetEconomicsSummary?: {
    laudusAssets?: number;
    candidateRows?: number;
    strongCandidates?: number;
    withAcquisitionCost?: number;
    depreciationReady?: number;
    depreciationBlocked?: number;
    withMaintenanceHistory?: number;
    fullyConsumedByCalendar?: number;
    historicalBackfillRequired?: number;
    documentLookupRequired?: number;
    invoiceCoverageStart?: string | null;
    reconciliationOpportunities?: number;
    reconciliationOpportunityMaintenanceCost?: number;
  };
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
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiSources, setAiSources] = useState<string[]>([]);
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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
  const laudusAging = (data?.laudusAging || []).map((row) => ({
    bucket: String(row.bucket || 'Sin clasificar'),
    invoices: Number(row.invoices || 0),
    amount: Number(row.amount || 0),
  }));
  const agingTotal = laudusAging.reduce((sum, row) => sum + row.amount, 0);
  const olderThan90 = laudusAging.find((row) => row.bucket === '>90 días');
  const olderThan90Share = agingTotal > 0 ? Number(olderThan90?.amount || 0) / agingTotal : null;
  const supplierPressure = (data?.laudusSupplierPressure || []).slice(0, 8).map((row) => {
    const outstanding = Number(row.outstanding || 0);
    const overdue = Number(row.overdue || 0);
    const current = Math.max(0, outstanding - overdue);
    const supplier = String(row.supplier || 'Sin identificar');
    const shortSupplier = supplier.length > 28 ? `${supplier.slice(0, 26)}…` : supplier;
    const maxDaysOverdue = Number(row.maxDaysOverdue || 0);
    return {
      supplier: shortSupplier,
      overdue,
      current,
      invoices: Number(row.invoices || 0),
      maxDaysOverdue,
    };
  });
  const pressureTrajectory = (data?.laudusPressureTrajectory || []).map((row) => ({
    label: String(row.label || ''),
    overdue: Number(row.overdue || 0),
    olderThan90: Number(row.olderThan90 || 0),
    current: Number(row.current || 0),
    noDueDate: Number(row.noDueDate || 0),
  }));
  const pressureToday = pressureTrajectory[0] || null;
  const pressure60 = pressureTrajectory.find((row) => row.label === '+60 días') || null;
  const overdueIncrease60 =
    pressureToday && pressure60 ? Math.max(0, pressure60.overdue - pressureToday.overdue) : null;

  const assetEconomics = (data?.assetEconomics || []).map((row) => ({
    name: String(row.canonicalAssetName || row.laudusName || 'Activo'),
    code: String(row.canonicalAssetCode || ''),
    lifeConsumedPct: Number(row.lifeConsumedPct || 0) * 100,
    maintenanceCost: Number(row.maintenanceCost || 0),
    maintenanceMovements: Number(row.maintenanceMovements || 0),
    usefulLifeYears: Number(row.usefulLifeYears || 0),
    acquisitionDate: row.acquisitionDate || null,
    estimatedRetirementDate: row.estimatedRetirementDate || null,
    evidenceLevel: String(row.evidenceLevel || ''),
    exactPlateSupport: Boolean(row.exactPlateSupport),
  }));
  const assetEconomicsSummary = data?.assetEconomicsSummary || {};
  const assetReconciliationOpportunities = (data?.assetReconciliationOpportunities || [])
    .map((row) => ({
      canonicalAssetId: String(row.canonicalAssetId || ''),
      code: String(row.canonicalAssetCode || ''),
      name: String(row.canonicalAssetName || 'Activo por revisar'),
      candidateCount: Number(row.candidateCount || 0),
      exactIdentifierCount: Number(row.exactIdentifierCount || 0),
      evidenceLevels: Array.isArray(row.evidenceLevels) ? row.evidenceLevels.map(String) : [],
      laudusNames: Array.isArray(row.laudusNames) ? row.laudusNames.map(String) : [],
      maintenanceCost: Number(row.maintenanceCost || 0),
      maintenanceMovements: Number(row.maintenanceMovements || 0),
      lastMaintenanceCostDate: row.lastMaintenanceCostDate || null,
      imageUrl: row.imageUrl || null,
    }))
    .filter((row) => row.maintenanceCost > 0)
    .slice(0, 6);
  const todayMs = Date.now();
  const retirementHorizon = (months: number) =>
    assetEconomics.filter((row) => {
      if (!row.estimatedRetirementDate) return false;
      const retirement = new Date(row.estimatedRetirementDate).getTime();
      if (!Number.isFinite(retirement)) return false;
      const max = new Date();
      max.setMonth(max.getMonth() + months);
      return retirement >= todayMs && retirement <= max.getTime();
    }).length;
  const retiredByCalendar = assetEconomics.filter((row) => row.lifeConsumedPct >= 100).length;

  const nextDueDate = typeof primaryForecast?.next_due_date === 'string' ? primaryForecast.next_due_date : null;
  const bankStatementDate = bankReconciliation.data?.bankStatement?.dateTo || null;
  const bankStatementAgeDays = bankStatementDate ? Math.max(0, -Number(daysUntil(bankStatementDate) || 0)) : null;
  const bankStatementIsHistorical = bankStatementAgeDays !== null && bankStatementAgeDays > 90;

  const nextDueDays = daysUntil(nextDueDate);
  const overdueRatio =
    Number(laudusSummary.open_amount || 0) > 0
      ? Number(laudusSummary.overdue_amount || 0) / Number(laudusSummary.open_amount || 0)
      : null;
  const forecastOpenPayables = Number(primaryForecast?.open_payables || 0);
  const forecastNoDueDateCount = Number(primaryForecast?.no_due_date_count || 0);
  const forecastCoverage =
    forecastOpenPayables > 0
      ? Math.max(0, Math.min(1, (forecastOpenPayables - forecastNoDueDateCount) / forecastOpenPayables))
      : null;
  const hasCashProjection = cashProjection.some((row) => Number(row.amount || 0) > 0);

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

  const analyzeWithMotil = async (message: string) => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    setAiSources([]);
    try {
      const response = await fetch('/api/finance/assistant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, conversationId: aiConversationId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo ejecutar el análisis MOTIL.');
      setAiInsight(typeof payload?.answer === 'string' ? payload.answer : 'Sin análisis disponible.');
      setAiConversationId(typeof payload?.conversationId === 'string' ? payload.conversationId : aiConversationId);
      setAiSources(
        Array.isArray(payload?.sources)
          ? payload.sources
              .map((source: unknown) =>
                typeof source === 'string'
                  ? source
                  : source && typeof source === 'object' && 'source' in source
                    ? String((source as { source?: unknown }).source || '')
                    : '',
              )
              .filter(Boolean)
              .slice(0, 6)
          : [],
      );
    } catch (cause) {
      setAiError(cause instanceof Error ? cause.message : 'No se pudo ejecutar el análisis MOTIL.');
    } finally {
      setAiLoading(false);
    }
  };

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
    <div className="mx-auto w-full max-w-[1600px] space-y-6 pb-10">
      <section className="border-b px-1 pb-6 pt-1 sm:px-0">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Finanzas
              </p>
              <span className="h-1 w-1 rounded-full bg-border" aria-hidden="true" />
              <span className="text-[11px] text-muted-foreground">MOTIL + Laudus</span>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Decisiones financieras</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              {pendingAttention.length > 0
                ? `${number(pendingAttention.length)} prioridades requieren revisión. El resto del detalle queda disponible bajo demanda.`
                : 'Sin facturas prioritarias en revisión. El resto de señales financieras se muestra por fuente y evidencia.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
            <span className="inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium text-muted-foreground">
              {pendingAttention.length > 0 ? `${number(pendingAttention.length)} facturas por revisar` : 'Sin facturas prioritarias'}
            </span>
            <a
              href="#revisar-prioridades"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Revisar prioridades <ArrowRight className="h-4 w-4" />
            </a>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">
          {error.message}
        </div>
      ) : null}

      <LaudusFinanceControlCard />

      <section className="grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-3" aria-label="Resumen financiero">
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
          <div key={label} className="bg-card px-5 py-5 sm:px-6">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">
              {isLoading || error ? '—' : value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </section>

      <section id="revisar-prioridades" className="scroll-mt-24 overflow-hidden rounded-xl border bg-card">
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
                    className="rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/15 disabled:opacity-50"
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



      <section className="grid items-start gap-4 xl:grid-cols-[1.45fr_0.95fr]" aria-label="Control financiero ejecutivo">
        <div className="rounded-xl border bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Presión financiera</p>
              <h2 className="mt-1 text-lg font-semibold">Edad del saldo Laudus</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Cuánto del saldo abierto está corriente y cuánto lleva semanas o meses vencido.
              </p>
            </div>

          </div>
          {olderThan90Share !== null ? (
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tracking-tight">
                {new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 0 }).format(olderThan90Share)}
              </span>
              <span className="text-xs text-muted-foreground">del saldo abierto tiene más de 90 días</span>
            </div>
          ) : null}
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={laudusAging} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="bucket" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickFormatter={(value) => compactClp(Number(value))} tickLine={false} axisLine={false} width={64} fontSize={11} />
                <Tooltip
                  formatter={(value) => [money(Number(value)), 'Saldo abierto']}
                  labelFormatter={(label) => {
                    const row = laudusAging.find((item) => item.bucket === label);
                    return row ? `${label} · ${number(row.invoices)} documentos` : String(label);
                  }}
                />
                <Bar dataKey="amount" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">ETA financiero</p></div>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {forecastOpenPayables === 0
                ? 'Sin CxP abiertas'
                : nextDueDays === null
                  ? 'Fecha pendiente'
                  : nextDueDays < 0
                    ? `${number(Math.abs(nextDueDays))} días vencido`
                    : nextDueDays === 0
                      ? 'Hoy'
                      : `${number(nextDueDays)} días`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {forecastOpenPayables === 0
                ? 'No hay CxP aprobadas pendientes en MOTIL para proyectar.'
                : nextDueDate
                  ? `Próximo vencimiento registrado: ${shortDate(nextDueDate)}`
                  : 'Hay obligaciones abiertas sin próximo vencimiento utilizable.'}
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Cobertura de fechas: {forecastCoverage === null ? 'Sin universo proyectable' : new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 0 }).format(forecastCoverage)}
            </p>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-2"><BrainCircuit className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Inteligencia MOTIL</p></div>
            <p className="mt-3 text-base font-semibold">{intelligenceSignal.title}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{intelligenceSignal.detail}</p>
            <p className="mt-3 text-xs text-muted-foreground">Señal explicable · recalculada desde evidencia financiera</p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {[
                ['Qué revisar', 'Analiza exclusivamente Finanzas y dime qué 3 asuntos debería revisar primero el gerente de finanzas. Usa sólo evidencia MOTIL/Laudus autorizada. Para cada asunto: monto o hecho, por qué importa, evidencia/fuente y siguiente validación humana.'],
                ['Qué viene', 'Analiza exclusivamente Finanzas y dime qué viene en los próximos 7, 30, 60 y 90 días usando forecast contractual y aging. No inventes predicción estadística ni confianza. Señala brechas de fechas o evidencia.'],
              ].map(([label, prompt]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => void analyzeWithMotil(prompt)}
                  disabled={aiLoading}
                  className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
                >
                  {aiLoading ? 'Analizando…' : label}
                </button>
              ))}
            </div>
            <details className="mt-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none py-1 font-medium hover:text-foreground">Más análisis</summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {[
                  ['Fuera de patrón', 'Analiza exclusivamente Finanzas y señala concentraciones, excepciones o faltantes de evidencia que merezcan atención. No llames anomalía estadística a algo que no tenga modelo validado. Prioriza máximo 3.'],
                  ['Qué activo revisar', 'Analiza exclusivamente la economía de activos disponible en Finanzas. Prioriza máximo 3 activos candidatos usando vida útil consumida, costo histórico de mantenimiento y nivel de evidencia de identidad. No calcules valor libro, depreciación CLP ni ahorro de reposición si falta costo de adquisición verificado.'],
                ].map(([label, prompt]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => void analyzeWithMotil(prompt)}
                    disabled={aiLoading}
                    className="inline-flex h-9 items-center justify-center rounded-md border bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {aiLoading ? 'Analizando…' : label}
                  </button>
                ))}
              </div>
            </details>
            <form
              className="mt-3 flex gap-2"
              onSubmit={(event) => {
                event.preventDefault();
                const question = aiQuestion.trim();
                if (!question) return;
                setAiQuestion('');
                void analyzeWithMotil(question);
              }}
            >
              <input
                value={aiQuestion}
                onChange={(event) => setAiQuestion(event.target.value)}
                placeholder="Pregunta sobre caja, proveedores o vencimientos"
                className="h-9 min-w-0 flex-1 rounded-md border bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
                disabled={aiLoading}
              />
              <button
                type="submit"
                disabled={aiLoading || !aiQuestion.trim()}
                className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
              >
                Preguntar
              </button>
            </form>
            {aiError ? <p className="mt-2 text-xs text-destructive">{aiError}</p> : null}
            {aiInsight ? (
              <div className="mt-3 rounded-md bg-muted/40 p-3">
                <p className="whitespace-pre-line text-xs leading-5 text-foreground">{aiInsight}</p>
                {aiSources.length > 0 ? (
                  <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
                    Evidencia: {aiSources.join(' · ')}
                  </p>
                ) : null}
              </div>
            ) : null}
            <details className="mt-4 border-t pt-3 text-xs">
              <summary className="cursor-pointer select-none font-medium text-muted-foreground hover:text-foreground">
                Predicción estadística · En calibración
              </summary>
              <p className="mt-2 leading-5 text-muted-foreground">
                MOTIL separa primero operación real de cargas históricas extraordinarias antes de proyectar tendencia. Mientras tanto, la caja a 90 días usa vencimientos reales y no estimaciones.
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2" aria-label="Proyecciones financieras">
        <div className="rounded-xl border bg-card p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Trayectoria contractual</p>
            <h2 className="mt-1 text-lg font-semibold">Presión si nada cambia</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Evolución de la exposición Laudus usando sólo fechas de vencimiento actuales. No supone pagos ni es una predicción estadística.
            </p>
          </div>
          {overdueIncrease60 !== null ? (
            <div className="mt-4">
              <p className="text-2xl font-semibold tracking-tight">{money(overdueIncrease60)}</p>
              <p className="text-xs text-muted-foreground">adicionales pasarían a vencido dentro de 60 días si no cambia el estado actual</p>
            </div>
          ) : null}
          {pressureTrajectory.length === 0 ? (
            <p className="py-10 text-sm text-muted-foreground">Sin fechas suficientes para proyectar presión.</p>
          ) : (
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pressureTrajectory} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickFormatter={(value) => compactClp(Number(value))} tickLine={false} axisLine={false} width={64} fontSize={11} />
                  <Tooltip
                    formatter={(value, name) => [
                      money(Number(value)),
                      name === 'olderThan90' ? '>90 días' : name === 'overdue' ? 'Vencido total' : 'Corriente',
                    ]}
                  />
                  <Legend formatter={(value) => value === 'olderThan90' ? '>90 días' : value === 'overdue' ? 'Vencido total' : 'Corriente'} />
                  <Line type="monotone" dataKey="overdue" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="olderThan90" stroke="var(--destructive)" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Para caja operativa, MOTIL mantiene aparte las CxP aprobadas: {hasCashProjection ? 'hay obligaciones proyectables.' : 'hoy no hay CxP aprobadas pendientes.'}
          </p>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Concentración accionable</p>
            <h2 className="mt-1 text-lg font-semibold">Presión por proveedor</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Top 8 por saldo abierto Laudus. Separa monto vencido de monto aún corriente.
            </p>
          </div>
          {supplierPressure.length === 0 ? (
            <p className="py-10 text-sm text-muted-foreground">Sin saldo abierto por proveedor disponible.</p>
          ) : (
            <div className="mt-4 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierPressure} layout="vertical" margin={{ top: 8, right: 8, left: 24, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => compactClp(Number(value))} tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis type="category" dataKey="supplier" width={150} tickLine={false} axisLine={false} fontSize={10} />
                  <Tooltip
                    formatter={(value, name) => [money(Number(value)), name === 'overdue' ? 'Vencido' : 'Corriente']}
                    labelFormatter={(label) => {
                      const row = supplierPressure.find((item) => item.supplier === label);
                      return row
                        ? `${label} · ${number(row.invoices)} docs · máx. ${number(row.maxDaysOverdue)} días`
                        : String(label);
                    }}
                  />
                  <Legend formatter={(value) => value === 'overdue' ? 'Vencido' : 'Corriente'} />
                  <Bar dataKey="overdue" stackId="total" fill="var(--primary)" />
                  <Bar dataKey="current" stackId="total" fill="var(--secondary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </section>

      <section className="rounded-lg border" aria-label="Economía del activo">
        <div className="flex flex-col gap-2 border-b px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Economía del activo</p>
            <h2 className="mt-1 text-lg font-semibold">Qué conviene destrabar primero</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Prioriza activos por costo histórico y calidad de conciliación. La depreciación monetaria sigue bloqueada hasta contar con costo base verificable.
            </p>
          </div>
          <span className="text-xs text-muted-foreground">
            {number(assetEconomicsSummary.strongCandidates || 0)} matches fuertes · {number(assetEconomicsSummary.laudusAssets || 0)} activos Laudus
          </span>
        </div>

        <div className="grid gap-px border-b bg-border sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Activos Laudus', number(assetEconomicsSummary.laudusAssets || 0), 'universo de activos fijos'],
            ['Matches fuertes', number(assetEconomicsSummary.strongCandidates || 0), 'identidad suficiente para analizar'],
            ['Por conciliar', number(assetEconomicsSummary.reconciliationOpportunities || 0), 'prioridades con costo MOTIL'],
            ['Costo histórico por conciliar', money(assetEconomicsSummary.reconciliationOpportunityMaintenanceCost || 0), 'no es ahorro ni valor libro'],
          ].map(([label, value, detail]) => (
            <div key={label} className="bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-1 text-xl font-semibold">{value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-0 xl:grid-cols-[1.45fr_0.75fr]">
          <div className="border-b p-5 xl:border-b-0 xl:border-r">
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Prioridades de conciliación</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Equipos con mayor costo histórico donde resolver identidad desbloquea análisis financiero confiable.
                </p>
              </div>
              <span className="hidden text-xs text-muted-foreground sm:block">Fotos referenciales · identificación rápida</span>
            </div>

            {assetReconciliationOpportunities.length === 0 ? (
              <p className="py-8 text-sm text-muted-foreground">Sin conciliaciones económicas priorizables.</p>
            ) : (
              <div className="divide-y">
                {assetReconciliationOpportunities.slice(0, 5).map((row, index) => (
                    <div
                      key={row.canonicalAssetId || `${row.code}-${row.name}`}
                      className="grid gap-3 py-3 sm:grid-cols-[28px_52px_minmax(0,1fr)_140px] sm:items-center"
                    >
                      <span className="text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                      <div className="hidden h-10 w-12 overflow-hidden rounded-md border bg-muted sm:block">
                        {row.imageUrl ? (
                          <img
                            src={row.imageUrl}
                            alt={`Referencia visual de ${row.name}`}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">Sin foto</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-medium">{row.name}</p>
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            Por conciliar
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {row.code || 'Sin código'} · {number(row.candidateCount)} candidatos Laudus · {number(row.maintenanceMovements)} movimientos
                        </p>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {row.exactIdentifierCount > 0
                            ? `${number(row.exactIdentifierCount)} candidato(s) con identificador exacto`
                            : 'Identidad requiere revisión humana'}
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-sm font-semibold tabular-nums">{money(row.maintenanceCost)}</p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">mantenimiento histórico</p>
                      </div>
                    </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Readiness de depreciación</p>
            <h3 className="mt-1 text-base font-semibold">Qué falta para calcular CLP</h3>
            <div className="mt-4 space-y-3">
              {[
                ['Costo base disponible', number(assetEconomicsSummary.withAcquisitionCost || 0), 'de los matches fuertes', 'secondary'],
                ['Backfill histórico', number(assetEconomicsSummary.historicalBackfillRequired || 0), assetEconomicsSummary.invoiceCoverageStart ? `anteriores a ${shortDate(assetEconomicsSummary.invoiceCoverageStart)}` : 'histórico incompleto', 'primary'],
                ['Búsqueda documental', number(assetEconomicsSummary.documentLookupRequired || 0), 'dentro del período cubierto', 'primary'],
              ].map(([label, value, detail, tone]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
                  </div>
                  <span className={`text-lg font-semibold ${tone === 'secondary' ? 'text-secondary' : 'text-primary'}`}>{value}</span>
                </div>
              ))}
            </div>

            {assetEconomics.length > 0 ? (
              <div className="mt-5 border-t pt-4">
                <p className="text-xs font-medium">Vida útil · matches fuertes</p>
                <div className="mt-3 space-y-3">
                  {assetEconomics.slice(0, 4).map((row) => (
                    <div key={`${row.code}-${row.name}`}>
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="truncate text-muted-foreground">{row.name}</span>
                        <span className="font-medium">{number(Math.round(row.lifeConsumedPct))}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full ${row.lifeConsumedPct >= 100 ? 'bg-destructive' : row.lifeConsumedPct >= 80 ? 'bg-primary' : 'bg-secondary'}`}
                          style={{ width: `${Math.min(100, Math.max(0, row.lifeConsumedPct))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5 rounded-md border border-destructive/20 bg-destructive/5 px-3 py-3 text-xs leading-5 text-muted-foreground">
              <span className="font-medium text-destructive">Depreciación CLP bloqueada.</span>{' '}
              Falta costo de adquisición verificable. MOTIL no reparte montos de factura entre activos sin evidencia.
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border bg-card">
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

            <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-xs text-muted-foreground">
              <span>Evidencia financiera trazable</span>
              <div className="flex items-center gap-4">
                <Link href="/dashboard/finanzas/fuentes" className="font-medium hover:text-foreground">
                  Fuentes y calidad
                </Link>
                <Link href="/dashboard/legal" className="font-medium hover:text-foreground">
                  Evidencia legal
                </Link>
              </div>
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

      <section className="overflow-hidden rounded-xl border bg-card">
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
            {bankStatementIsHistorical ? (
              <div className="px-5 py-5">
                <p className="text-sm font-semibold">Conciliación histórica disponible</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  La última cartola entregada por Laudus termina el {bankReconciliation.data.bankStatement?.dateTo ? shortDate(bankReconciliation.data.bankStatement.dateTo) : '—'}.
                  MOTIL conserva sus diferencias como evidencia, pero no las presenta como pendientes actuales.
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Cartola sin contabilidad · histórico</p>
                    <p className="mt-1 text-lg font-semibold">{number(bankReconciliation.data.bankOnly.count)} movimientos</p>
                    <p className="text-xs text-muted-foreground">{money(bankReconciliation.data.bankOnly.amount)} en la cartola histórica</p>
                  </div>
                  <div className="rounded-md border p-3">
                    <p className="text-xs text-muted-foreground">Contabilidad sin cartola · histórico</p>
                    <p className="mt-1 text-lg font-semibold">{number(bankReconciliation.data.journalOnly.count)} movimientos</p>
                    <p className="text-xs text-muted-foreground">{money(bankReconciliation.data.journalOnly.amount)} en la cartola histórica</p>
                  </div>
                </div>
                <p className="mt-4 text-xs text-muted-foreground">
                  Acción: incorporar una cartola vigente en Laudus o conectar una fuente bancaria actual antes de usar conciliación para decisiones de caja.
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-px border-b bg-border sm:grid-cols-2">
                  <div className="bg-card px-5 py-5 sm:px-6">
                    <p className="text-xs text-muted-foreground">En cartola, no en contabilidad</p>
                    <p className="mt-1 text-2xl font-semibold">{number(bankReconciliation.data.bankOnly.count)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{money(bankReconciliation.data.bankOnly.amount)} por revisar</p>
                  </div>
                  <div className="bg-card px-5 py-5 sm:px-6">
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
              </>
            )}

            {bankReconciliation.data.bankStatement ? (
              <p className="border-t px-5 py-3 text-xs text-muted-foreground">
                Fuente: Laudus · última cartola disponible · {shortDate(bankReconciliation.data.bankStatement.dateFrom)} → {shortDate(bankReconciliation.data.bankStatement.dateTo)}.
                {bankStatementIsHistorical ? ' Evidencia histórica: no representa el saldo bancario actual.' : ''}
              </p>
            ) : null}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
        <div className="rounded-xl border bg-card p-5">
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

        <div className="rounded-xl border bg-card p-5">
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

    </div>
  );
}
