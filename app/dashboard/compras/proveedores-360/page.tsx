'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileText, PackageSearch, ReceiptText, Search, ShieldCheck, ShoppingCart, WalletCards } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

type Supplier = { id: string; tax_id: string; legal_name: string; trade_name?: string | null; business_activity?: string | null; payment_terms?: string | null; email?: string | null; phone?: string | null; region?: string | null; is_active: boolean; validation_status: string };
type Performance = { operational_score?: number | null; delivery_score?: number | null; quality_score?: number | null; invoice_score?: number | null; evidence_dimensions?: number | null; score_version?: string | null; delivery_scored_orders?: number | null; receipt_count?: number | null; invoice_scored_count?: number | null; returns_count?: number | null; returned_quantity?: number | null };
type LaudusCurrencySummary = { currency: string; invoiceCount: number; totalAmount: number; paidAmount: number; outstandingAmount: number; overdueAmount: number; overdueInvoices: number; latestInvoiceAt: string | null; latestPaymentAt: string | null };
type LaudusFinancial = { linked: boolean; reconciliationStatus?: string | null; supplierSyncAt?: string | null; sourceHealth?: Array<{ domain: string; health_status: string | null; last_success_at: string | null; consecutive_failures: number | null; open_incidents: number | null }>; coverage: { totalRows: number; returnedRows: number; complete: boolean }; summaryByCurrency: LaudusCurrencySummary[]; invoices: Array<{ purchase_invoice_external_id: string; doc_number: string | null; issued_date: string | null; due_date: string | null; total_amount: number | null; currency: string | null; paid_amount: number | null; outstanding_amount: number | null; payment_count: number | null; last_payment_at: string | null; payment_status: string | null }>; readOnly: boolean; canonicalMutated: boolean };
type MotilFinancial = { summaryByCurrency: Array<{ currency:string; approvedAmount:number; paidAmount:number; outstandingAmount:number; overdueAmount:number; payableCount:number; overdueCount:number }>; payables:any[]; payments:any[]; unreconciledPayments:number; maintenanceLinkage:{ operationalOrders:number; linkedWorkOrders:number; linkedAssets:number; unlinkedOrders:number }; semantics:Record<string,string> };
type Detail = { supplier: Supplier; contractor: any; performance: Performance | null; legacyPerformance?: any; orders: any[]; operationalOrders: any[]; quotations: any[]; contracts: any[]; documents: any[]; invoices: any[]; returns: any[]; suppliedProducts: any[]; motilFinancial?: MotilFinancial; laudusFinancial?: LaudusFinancial };
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const pct = (value?: number | null) => value == null ? 'Sin evidencia' : `${Number(value).toFixed(0)}%`;

export default function Suppliers360Page() {
  const [q, setQ] = useState('');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const search = useCallback(async (term = '') => {
    const response = await apiFetch(`/api/procurement/suppliers-360?q=${encodeURIComponent(term)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar los proveedores.');
    setSuppliers(payload.suppliers || []);
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const response = await apiFetch(`/api/procurement/suppliers-360?supplierId=${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo cargar la ficha.');
      setDetail(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la ficha.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { search().catch((cause) => setError(cause instanceof Error ? cause.message : 'Error de carga.')); }, [search]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  const totals = useMemo(() => {
    if (!detail) return { spend: 0, invoices: 0, openDifferences: 0 };
    return {
      spend: detail.orders.reduce((sum, row) => sum + Number(row.total_amount || 0), 0) + detail.operationalOrders.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
      invoices: detail.invoices.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
      openDifferences: detail.invoices.reduce((sum, row) => sum + (row.procurement_match_exceptions || []).filter((item: any) => item.status === 'open').length, 0),
    };
  }, [detail]);

  const scoreLabel = detail?.performance?.operational_score == null ? 'Sin evidencia' : `${Number(detail.performance.operational_score).toFixed(0)}/100`;
  const cards = detail ? [
    { label: 'Compras acumuladas', value: money.format(totals.spend), Icon: ShoppingCart },
    { label: 'Facturas operacionales', value: money.format(totals.invoices), Icon: ReceiptText },
    { label: 'Productos', value: detail.suppliedProducts.length, Icon: PackageSearch },
    { label: 'Contratos', value: detail.contracts.length, Icon: FileText },
    { label: 'Score operacional', value: scoreLabel, Icon: ShieldCheck },
  ] : [];

  return <main className="space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Compras</p><h1 className="mt-1 text-2xl font-semibold">Proveedor 360°</h1><p className="mt-1 text-sm text-muted-foreground">Ficha única con compras, contratos, documentos, productos, facturas, devoluciones y desempeño.</p></header>
    <section className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <aside className="rounded-lg border bg-card">
        <form onSubmit={(e) => { e.preventDefault(); search(q).catch((cause) => setError(cause.message)); }} className="flex gap-2 border-b p-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="RUT o nombre" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"/><button className="rounded-md border px-3" aria-label="Buscar"><Search className="h-4 w-4"/></button></form>
        <div className="max-h-[70vh] divide-y overflow-y-auto">{suppliers.map((supplier) => <button key={supplier.id} onClick={() => setSelectedId(supplier.id)} className={`w-full p-3 text-left text-sm hover:bg-muted ${selectedId === supplier.id ? 'bg-muted' : ''}`}><p className="font-medium">{supplier.trade_name || supplier.legal_name}</p><p className="text-xs text-muted-foreground">{supplier.tax_id} · {supplier.region || 'Sin región'}</p></button>)}</div>
      </aside>
      <div className="space-y-5">
        {!selectedId && <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Selecciona un proveedor para abrir su ficha completa.</div>}
        {loading && <div className="rounded-lg border p-6 text-sm text-muted-foreground">Cargando ficha…</div>}
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
        {detail && !loading && <>
          <section className="rounded-lg border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{detail.supplier.trade_name || detail.supplier.legal_name}</h2><p className="text-sm text-muted-foreground">{detail.supplier.legal_name} · {detail.supplier.tax_id}</p><p className="mt-2 text-sm">{detail.supplier.business_activity || 'Actividad no informada'}</p></div><div className="text-right text-sm"><p>{detail.supplier.email || 'Sin correo'}</p><p>{detail.supplier.phone || 'Sin teléfono'}</p><p>{detail.supplier.payment_terms || 'Sin condición de pago'}</p></div></div></section>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{cards.map(({ label, value, Icon }) => <article key={label} className="rounded-lg border bg-card p-4"><div className="flex justify-between text-muted-foreground"><span className="text-xs">{label}</span><Icon className="h-4 w-4"/></div><p className="mt-2 text-xl font-semibold">{value}</p></article>)}</section>

          <MotilFinancePanel financial={detail.motilFinancial} />

          <details className="rounded-lg border bg-card">
            <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium">Fuente Laudus · evidencia financiera de contraste</summary>
            <div className="border-t"><LaudusFinancePanel financial={detail.laudusFinancial} /></div>
          </details>

          <section className="rounded-lg border bg-card p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Score operacional v2</p><h3 className="mt-1 text-lg font-semibold">Evidencia que alimenta la próxima adjudicación</h3><p className="mt-1 text-sm text-muted-foreground">Promedio simple sólo de dimensiones con evidencia. Sin datos, Motil no asigna score.</p></div><p className="text-sm text-muted-foreground">Evidencia: {Number(detail.performance?.evidence_dimensions || 0)}/3 dimensiones</p></div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ScoreDimension label="Entrega a tiempo" value={detail.performance?.delivery_score} evidence={`${Number(detail.performance?.delivery_scored_orders || 0)} OC evaluables`} />
              <ScoreDimension label="Calidad de recepción" value={detail.performance?.quality_score} evidence={`${Number(detail.performance?.receipt_count || 0)} recepciones`} />
              <ScoreDimension label="Match de factura" value={detail.performance?.invoice_score} evidence={`${Number(detail.performance?.invoice_scored_count || 0)} facturas evaluables`} />
            </div>
            <div className="mt-4 border-t pt-4 text-sm text-muted-foreground">Devoluciones: {Number(detail.performance?.returns_count || 0)} · Cantidad devuelta: {Number(detail.performance?.returned_quantity || 0)} · Versión: {detail.performance?.score_version || 'sin evidencia'}</div>
          </section>

          <section className="grid gap-5 xl:grid-cols-2">
            <Panel title="Órdenes recientes" empty="No hay órdenes relacionadas.">{[...detail.operationalOrders, ...detail.orders].slice(0, 10).map((row: any) => <Row key={`${row.id}-${row.order_number}`} title={row.order_number} meta={row.order_date || row.issued_at || ''} value={money.format(Number(row.total_amount || 0))}/>)}</Panel>
            <Panel title="Contratos y documentos" empty="No hay contratos compatibles por RUT.">{detail.contracts.slice(0, 8).map((row: any) => <Row key={row.id} title={`${row.contract_number} · ${row.title}`} meta={`${row.start_date} — ${row.end_date}`} value={money.format(Number(row.contract_value || 0))}/>)}</Panel>
            <Panel title="Productos suministrados" empty="No hay productos relacionados.">{detail.suppliedProducts.slice(0, 12).map((row: any, index: number) => <Row key={`${row.product_code}-${index}`} title={row.product_code || row.description || 'Producto'} meta={`Cantidad histórica: ${Number(row.quantity || 0).toFixed(0)}`} value={money.format(Number(row.spend || 0))}/>)}</Panel>
            <Panel title="Calidad y conciliación" empty="No hay devoluciones ni facturas operacionales.">{detail.returns.slice(0, 5).map((row: any) => <Row key={row.id} title={row.return_number} meta={row.reason} value={row.status}/>)}{detail.invoices.slice(0, 7).map((row: any) => <Row key={row.id} title={`Factura ${row.invoice_number}`} meta={row.invoice_date} value={row.status}/>)}</Panel>
          </section>
          {totals.openDifferences > 0 && <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">Existen {totals.openDifferences} diferencias de factura pendientes de resolución.</p>}
        </>}
      </div>
    </section>
  </main>;
}

function ScoreDimension({ label, value, evidence }: { label: string; value?: number | null; evidence: string }) { return <div className="rounded-lg border p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{pct(value)}</p><p className="mt-1 text-xs text-muted-foreground">{evidence}</p></div>; }
function Panel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) { const count = Array.isArray(children) ? children.length : 1; return <section className="rounded-lg border bg-card"><div className="border-b p-4"><h3 className="font-semibold">{title}</h3></div><div className="divide-y">{count ? children : <p className="p-5 text-sm text-muted-foreground">{empty}</p>}</div></section>; }
function Row({ title, meta, value }: { title: string; meta: string; value: string }) { return <div className="flex items-start justify-between gap-4 p-4"><div><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{meta}</p></div><span className="shrink-0 text-sm">{value}</span></div>; }


function MotilFinancePanel({ financial }: { financial?: MotilFinancial }) {
  const summaries = financial?.summaryByCurrency || [];
  const linkage = financial?.maintenanceLinkage;
  return <section className="rounded-lg border bg-card">
    <div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Finanzas · MOTIL</p>
        <h3 className="mt-1 text-lg font-semibold">Caja y obligación operacional</h3>
        <p className="mt-1 text-sm text-muted-foreground">Lo aprobado, pagado y pendiente dentro del flujo MOTIL. Laudus queda como contraste contable en el bloque secundario.</p>
      </div>
      <a href="/dashboard/finanzas/pagos" className="text-xs font-medium underline underline-offset-2">Ir a Tesorería</a>
    </div>
    {!summaries.length ? <p className="p-5 text-sm text-muted-foreground">Este proveedor todavía no tiene CxP aprobadas en el flujo MOTIL.</p> :
      <div className="space-y-4 p-5">
        {summaries.map((summary) => <div key={summary.currency}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{summary.currency}</p><p className="text-xs text-muted-foreground">{summary.payableCount} CxP · {summary.overdueCount} vencidas</p></div>
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <FinanceMetric label="Aprobado" value={moneyFor(summary.currency, summary.approvedAmount)} />
            <FinanceMetric label="Pagado" value={moneyFor(summary.currency, summary.paidAmount)} />
            <FinanceMetric label="Pendiente" value={moneyFor(summary.currency, summary.outstandingAmount)} />
            <FinanceMetric label="Vencido" value={moneyFor(summary.currency, summary.overdueAmount)} />
          </div>
        </div>)}
        <p className="text-xs text-muted-foreground">Pagos MOTIL por conciliar: {Number(financial?.unreconciledPayments || 0)}</p>
      </div>}
    <div className="grid gap-px border-t bg-border sm:grid-cols-4">
      <FinanceMetric label="OC operativas" value={String(linkage?.operationalOrders ?? 0)} />
      <FinanceMetric label="Con OT" value={String(linkage?.linkedWorkOrders ?? 0)} />
      <FinanceMetric label="Con activo" value={String(linkage?.linkedAssets ?? 0)} />
      <FinanceMetric label="Sin vínculo mantenimiento" value={String(linkage?.unlinkedOrders ?? 0)} />
    </div>
    <div className="border-t px-5 py-3 text-xs text-muted-foreground">
      El vínculo a mantenimiento sólo se publica cuando la OC tiene OT o activo explícito. MOTIL no infiere destino por nombre de proveedor, producto ni centro de costo.
    </div>
  </section>;
}

function LaudusFinancePanel({ financial }: { financial?: LaudusFinancial }) {
  if (!financial?.linked) {
    return <section className="rounded-lg border bg-card p-5">
      <div className="flex items-start gap-3"><WalletCards className="mt-0.5 h-5 w-5 text-muted-foreground"/><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Finanzas · Laudus</p><h3 className="mt-1 font-semibold">Sin vínculo financiero confirmado</h3><p className="mt-1 text-sm text-muted-foreground">MOTIL no asociará facturas ni pagos por nombre aproximado. El proveedor debe estar conciliado con Laudus antes de mostrar exposición financiera.</p></div></div>
    </section>;
  }

  const complete = financial.coverage?.complete === true;
  const summaries = complete ? financial.summaryByCurrency || [] : [];
  const health = financial.sourceHealth || [];
  const sourceHealthy = health.length > 0 && health.every((row) => row.health_status === 'healthy' && Number(row.open_incidents || 0) === 0);
  const sourceDate = financial.supplierSyncAt
    ? new Date(financial.supplierSyncAt).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
    : 'N/D';

  return <section className="rounded-lg border bg-card">
    <div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Finanzas · Laudus</p><h3 className="mt-1 text-lg font-semibold">Exposición financiera</h3><p className="mt-1 text-sm text-muted-foreground">Lectura financiera reconciliada. Laudus conserva la autoridad contable y MOTIL no modifica sus registros.</p></div>
      <p className="text-xs text-muted-foreground">Laudus · actualizado {sourceDate} · {sourceHealthy ? 'fuente saludable' : 'fuente requiere revisión'}</p>
    </div>
    {!complete ? <div className="m-5 flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-4 text-sm"><AlertTriangle className="h-4 w-4 shrink-0"/><p>Cobertura parcial: {financial.coverage.returnedRows} de {financial.coverage.totalRows} facturas. No se publican totales incompletos.</p></div>
    : summaries.length === 0 ? <p className="p-5 text-sm text-muted-foreground">No hay historia financiera con moneda verificable para este proveedor.</p>
    : <div className="p-5">
        {summaries.map((summary) => <div key={summary.currency} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{summary.currency}</p><p className="text-xs text-muted-foreground">{summary.invoiceCount} facturas · {summary.overdueInvoices} vencidas</p></div>
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
            <FinanceMetric label="Facturado" value={moneyFor(summary.currency, summary.totalAmount)} />
            <FinanceMetric label="Pagado" value={moneyFor(summary.currency, summary.paidAmount)} />
            <FinanceMetric label="Pendiente" value={moneyFor(summary.currency, summary.outstandingAmount)} />
            <FinanceMetric label="Vencido" value={moneyFor(summary.currency, summary.overdueAmount)} />
          </div>
        </div>)}
        <div className="mt-5 border-t pt-4">
          <p className="text-sm font-medium">Facturas recientes</p>
          <div className="mt-2 divide-y">
            {(financial.invoices || []).slice(0, 8).map((row) => <div key={row.purchase_invoice_external_id} className="grid gap-2 py-3 text-sm sm:grid-cols-[1fr_120px_140px_120px] sm:items-center">
              <div><p className="font-medium">Factura {row.doc_number || 'sin número'}</p><p className="text-xs text-muted-foreground">{row.issued_date ? new Date(row.issued_date).toLocaleDateString('es-CL') : 'Fecha N/D'} · {paymentStatusLabel(row.payment_status)}</p></div>
              <div><p className="text-xs text-muted-foreground">Vence</p><p>{row.due_date ? new Date(row.due_date).toLocaleDateString('es-CL') : 'N/D'}</p></div>
              <div><p className="text-xs text-muted-foreground">Pendiente</p><p>{row.currency ? moneyFor(row.currency, Number(row.outstanding_amount || 0)) : 'N/D'}</p></div>
              <div className="sm:text-right"><p className="text-xs text-muted-foreground">Pagos</p><p>{Number(row.payment_count || 0)}</p></div>
            </div>)}
          </div>
        </div>
      </div>}
  </section>;
}

function FinanceMetric({ label, value }: { label: string; value: string }) {
  return <div className="bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{value}</p></div>;
}

function moneyFor(currency: string, value: number) {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(Number(value || 0));
  } catch {
    return `${currency} ${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number(value || 0))}`;
  }
}

function paymentStatusLabel(status?: string | null) {
  const labels: Record<string, string> = { paid: 'Pagada', partial: 'Pago parcial', partially_paid: 'Pago parcial', pending: 'Pendiente', unpaid: 'Pendiente', overdue: 'Vencida', credit_adjustment: 'Ajuste de crédito' };
  return status ? labels[status] || status : 'Estado N/D';
}
