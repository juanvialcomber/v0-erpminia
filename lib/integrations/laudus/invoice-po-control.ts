import type { SupabaseClient } from '@supabase/supabase-js';

type OpenInvoice = {
  purchase_invoice_external_id: string;
  doc_number: string | null;
  supplier_external_id: string | null;
  supplier_name: string | null;
  issued_date: string | null;
  total_amount: number | string | null;
  currency: string | null;
  outstanding_amount: number | string | null;
  payment_status: string | null;
};

type InvoiceLine = {
  invoice_external_id: string;
  product_external_id: string | null;
  sku: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
};

type PurchaseOrder = {
  external_id: string;
  order_number: string | null;
  supplier_external_id: string | null;
  issued_date: string | null;
  total_amount: number | string | null;
  currency: string | null;
  status: string | null;
};

type PurchaseOrderLine = {
  purchase_order_external_id: string;
  product_external_id: string | null;
  sku: string | null;
  quantity: number | string | null;
  unit_price: number | string | null;
  line_total: number | string | null;
};

export type InvoicePoCandidate = {
  invoiceExternalId: string;
  docNumber: string | null;
  supplierName: string | null;
  outstandingAmount: number;
  currency: string | null;
  paymentStatus: string | null;
  invoiceDate: string | null;
  purchaseOrderExternalId: string;
  orderNumber: string | null;
  poDate: string | null;
  score: number;
  confidence: 'strong' | 'review';
  matchedProducts: number;
  invoiceProducts: number;
  exactQuantityProducts: number;
  exactPriceProducts: number;
  coverageRatio: number;
  quantityMatchRatio: number;
  priceMatchRatio: number;
  documentAmountDelta: number | null;
  gapToSecond: number | null;
  reasons: string[];
};

const MAX_OPEN_INVOICES = 25;
const MAX_ORDER_HEADERS = 1000;
const QUERY_CHUNK = 50;

function num(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function productKey(row: { product_external_id?: string | null; sku?: string | null }) {
  const external = String(row.product_external_id || '').trim();
  if (external) return `id:${external}`;
  const sku = String(row.sku || '').trim().toUpperCase();
  return sku ? `sku:${sku}` : null;
}

function amountsByCurrency(rows: Array<{ currency?: string | null; outstandingAmount?: number; outstanding_amount?: number | string | null }>) {
  const totals: Record<string, number> = {};
  for (const row of rows) {
    const currency = String(row.currency || '').trim().toUpperCase() || 'UNKNOWN';
    const raw = row.outstandingAmount ?? row.outstanding_amount;
    totals[currency] = (totals[currency] || 0) + num(raw);
  }
  return totals;
}

function chunk<T>(rows: T[], size = QUERY_CHUNK) {
  const result: T[][] = [];
  for (let i = 0; i < rows.length; i += size) result.push(rows.slice(i, i + size));
  return result;
}

function withinWindow(poDate: string | null, invoiceDate: string | null) {
  if (!poDate || !invoiceDate) return false;
  const po = Date.parse(poDate);
  const invoice = Date.parse(invoiceDate);
  if (!Number.isFinite(po) || !Number.isFinite(invoice)) return false;
  const age = invoice - po;
  return age >= 0 && age <= 180 * 24 * 60 * 60 * 1000;
}

type AggregatedProduct = { quantity: number; lineTotal: number; unitPrice: number | null };

function aggregateProducts<T extends { product_external_id?: string | null; sku?: string | null; quantity?: unknown; unit_price?: unknown; line_total?: unknown }>(
  rows: T[],
) {
  const map = new Map<string, AggregatedProduct>();
  for (const row of rows) {
    const key = productKey(row);
    if (!key) continue;
    const current = map.get(key) || { quantity: 0, lineTotal: 0, unitPrice: null };
    current.quantity += num(row.quantity);
    current.lineTotal += num(row.line_total);
    map.set(key, current);
  }
  for (const value of map.values()) {
    value.unitPrice = value.quantity > 0 && value.lineTotal > 0
      ? value.lineTotal / value.quantity
      : null;
  }
  return map;
}

export function scoreInvoicePoCandidate(args: {
  invoice: OpenInvoice;
  invoiceLines: InvoiceLine[];
  purchaseOrder: PurchaseOrder;
  purchaseOrderLines: PurchaseOrderLine[];
}) {
  const invoiceProducts = aggregateProducts(args.invoiceLines);
  const poProducts = aggregateProducts(args.purchaseOrderLines);
  if (!invoiceProducts.size) return null;

  let matchedProducts = 0;
  let exactQuantityProducts = 0;
  let exactPriceProducts = 0;

  for (const [key, invoiceProduct] of invoiceProducts.entries()) {
    const poProduct = poProducts.get(key);
    if (!poProduct) continue;
    matchedProducts += 1;
    if (Math.abs(invoiceProduct.quantity - poProduct.quantity) < 0.0001) exactQuantityProducts += 1;
    if (
      invoiceProduct.unitPrice !== null &&
      poProduct.unitPrice !== null &&
      Math.abs(invoiceProduct.unitPrice - poProduct.unitPrice) < 0.01
    ) {
      exactPriceProducts += 1;
    }
  }

  if (!matchedProducts) return null;

  const coverageRatio = matchedProducts / invoiceProducts.size;
  const quantityMatchRatio = exactQuantityProducts / matchedProducts;
  const priceMatchRatio = exactPriceProducts / matchedProducts;
  const score = Math.round(
    40 +
      coverageRatio * 30 +
      quantityMatchRatio * 15 +
      priceMatchRatio * 15,
  );

  const invoiceTotal = num(args.invoice.total_amount);
  const poTotal = num(args.purchaseOrder.total_amount);
  const documentAmountDelta =
    invoiceTotal > 0 && poTotal > 0 ? Math.abs(invoiceTotal - poTotal) : null;

  return {
    score,
    matchedProducts,
    invoiceProducts: invoiceProducts.size,
    exactQuantityProducts,
    exactPriceProducts,
    coverageRatio,
    quantityMatchRatio,
    priceMatchRatio,
    documentAmountDelta,
  };
}

export async function loadLaudusInvoicePoControl(
  db: SupabaseClient,
  organizationId: string,
  limit = MAX_OPEN_INVOICES,
) {
  const safeLimit = Math.min(Math.max(limit, 1), MAX_OPEN_INVOICES);

  const openQuery = await db
    .from('laudus_purchase_invoice_payment_status_service_v1')
    .select(
      'purchase_invoice_external_id,doc_number,supplier_external_id,supplier_name,issued_date,total_amount,currency,outstanding_amount,payment_status',
      { count: 'exact' },
    )
    .eq('organization_id', organizationId)
    .in('payment_status', ['unpaid', 'partially_paid'])
    .order('outstanding_amount', { ascending: false })
    .limit(safeLimit);

  if (openQuery.error) throw new Error(openQuery.error.message);
  const openInvoices = (openQuery.data || []) as OpenInvoice[];
  if (!openInvoices.length) {
    return {
      summary: { openTotal: openQuery.count || 0, examined: 0, withLines: 0, withCandidate: 0, strong: 0, review: 0, exposureExaminedByCurrency: {}, candidateExposureByCurrency: {} },
      candidates: [] as InvoicePoCandidate[],
      readOnly: true,
    };
  }

  const invoiceIds = openInvoices.map((row) => row.purchase_invoice_external_id);
  const invoiceLines: InvoiceLine[] = [];
  for (const ids of chunk(invoiceIds)) {
    const result = await db
      .from('laudus_purchase_invoice_lines_service_v1')
      .select('invoice_external_id,product_external_id,sku,quantity,unit_price,line_total')
      .eq('organization_id', organizationId)
      .in('invoice_external_id', ids);
    if (result.error) throw new Error(result.error.message);
    invoiceLines.push(...((result.data || []) as InvoiceLine[]));
  }

  const linesByInvoice = new Map<string, InvoiceLine[]>();
  for (const row of invoiceLines) {
    const list = linesByInvoice.get(row.invoice_external_id) || [];
    list.push(row);
    linesByInvoice.set(row.invoice_external_id, list);
  }

  const invoicesWithLines = openInvoices.filter((invoice) => (linesByInvoice.get(invoice.purchase_invoice_external_id) || []).length > 0);
  const suppliers = [...new Set(invoicesWithLines.map((row) => row.supplier_external_id).filter((value): value is string => Boolean(value)))];
  if (!suppliers.length) {
    return {
      summary: {
        openTotal: openQuery.count || 0,
        examined: openInvoices.length,
        withLines: invoicesWithLines.length,
        withCandidate: 0,
        strong: 0,
        review: 0,
        exposureExaminedByCurrency: amountsByCurrency(openInvoices),
        candidateExposureByCurrency: {},
      },
      candidates: [] as InvoicePoCandidate[],
      readOnly: true,
    };
  }

  const dated = invoicesWithLines.map((row) => Date.parse(row.issued_date || '')).filter(Number.isFinite);
  const maxDate = dated.length ? new Date(Math.max(...dated)) : new Date();
  const minDate = dated.length ? new Date(Math.min(...dated) - 180 * 24 * 60 * 60 * 1000) : new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const orderHeaders: PurchaseOrder[] = [];
  for (const supplierChunk of chunk(suppliers)) {
    const result = await db
      .from('laudus_purchase_orders_service_v1')
      .select('external_id,order_number,supplier_external_id,issued_date,total_amount,currency,status')
      .eq('organization_id', organizationId)
      .in('supplier_external_id', supplierChunk)
      .gte('issued_date', minDate.toISOString())
      .lte('issued_date', maxDate.toISOString())
      .order('issued_date', { ascending: false })
      .limit(MAX_ORDER_HEADERS);
    if (result.error) throw new Error(result.error.message);
    orderHeaders.push(...((result.data || []) as PurchaseOrder[]));
  }

  const orderIds = [...new Set(orderHeaders.map((row) => row.external_id))];
  const poLines: PurchaseOrderLine[] = [];
  for (const ids of chunk(orderIds)) {
    const result = await db
      .from('laudus_purchase_order_lines_service_v1')
      .select('purchase_order_external_id,product_external_id,sku,quantity,unit_price,line_total')
      .eq('organization_id', organizationId)
      .in('purchase_order_external_id', ids);
    if (result.error) throw new Error(result.error.message);
    poLines.push(...((result.data || []) as PurchaseOrderLine[]));
  }

  const linesByOrder = new Map<string, PurchaseOrderLine[]>();
  for (const row of poLines) {
    const list = linesByOrder.get(row.purchase_order_external_id) || [];
    list.push(row);
    linesByOrder.set(row.purchase_order_external_id, list);
  }

  const candidates: InvoicePoCandidate[] = [];

  for (const invoice of invoicesWithLines) {
    const invoiceLineRows = linesByInvoice.get(invoice.purchase_invoice_external_id) || [];
    const relevantOrders = orderHeaders.filter(
      (order) =>
        order.supplier_external_id === invoice.supplier_external_id &&
        (!invoice.currency || !order.currency || invoice.currency.toUpperCase() === order.currency.toUpperCase()) &&
        withinWindow(order.issued_date, invoice.issued_date),
    );

    const scored = relevantOrders
      .map((purchaseOrder) => {
        const metrics = scoreInvoicePoCandidate({
          invoice,
          invoiceLines: invoiceLineRows,
          purchaseOrder,
          purchaseOrderLines: linesByOrder.get(purchaseOrder.external_id) || [],
        });
        return metrics ? { purchaseOrder, metrics } : null;
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value))
      .sort((a, b) =>
        b.metrics.score - a.metrics.score ||
        b.metrics.matchedProducts - a.metrics.matchedProducts ||
        (a.metrics.documentAmountDelta ?? Number.MAX_SAFE_INTEGER) - (b.metrics.documentAmountDelta ?? Number.MAX_SAFE_INTEGER)
      );

    if (!scored.length) continue;

    const best = scored[0];
    const second = scored[1];
    const gapToSecond = second ? best.metrics.score - second.metrics.score : null;
    const confidence: 'strong' | 'review' =
      best.metrics.score >= 90 &&
      best.metrics.coverageRatio >= 0.8 &&
      best.metrics.matchedProducts >= 2 &&
      (gapToSecond === null || gapToSecond >= 10)
        ? 'strong'
        : 'review';

    const reasons = [
      'Proveedor Laudus exacto',
      `${best.metrics.matchedProducts}/${best.metrics.invoiceProducts} productos coinciden`,
      `${best.metrics.exactQuantityProducts}/${best.metrics.matchedProducts} cantidades coinciden`,
      `${best.metrics.exactPriceProducts}/${best.metrics.matchedProducts} precios coinciden`,
    ];

    candidates.push({
      invoiceExternalId: invoice.purchase_invoice_external_id,
      docNumber: invoice.doc_number,
      supplierName: invoice.supplier_name,
      outstandingAmount: num(invoice.outstanding_amount),
      currency: invoice.currency,
      paymentStatus: invoice.payment_status,
      invoiceDate: invoice.issued_date,
      purchaseOrderExternalId: best.purchaseOrder.external_id,
      orderNumber: best.purchaseOrder.order_number,
      poDate: best.purchaseOrder.issued_date,
      score: best.metrics.score,
      confidence,
      matchedProducts: best.metrics.matchedProducts,
      invoiceProducts: best.metrics.invoiceProducts,
      exactQuantityProducts: best.metrics.exactQuantityProducts,
      exactPriceProducts: best.metrics.exactPriceProducts,
      coverageRatio: best.metrics.coverageRatio,
      quantityMatchRatio: best.metrics.quantityMatchRatio,
      priceMatchRatio: best.metrics.priceMatchRatio,
      documentAmountDelta: best.metrics.documentAmountDelta,
      gapToSecond,
      reasons,
    });
  }

  candidates.sort((a, b) => b.outstandingAmount - a.outstandingAmount || b.score - a.score);

  return {
    summary: {
      openTotal: openQuery.count || 0,
      examined: openInvoices.length,
      withLines: invoicesWithLines.length,
      withCandidate: candidates.length,
      strong: candidates.filter((row) => row.confidence === 'strong').length,
      review: candidates.filter((row) => row.confidence === 'review').length,
      exposureExaminedByCurrency: amountsByCurrency(openInvoices),
      candidateExposureByCurrency: amountsByCurrency(candidates),
    },
    candidates: candidates.slice(0, 10),
    readOnly: true,
    semantics: {
      candidateIsNotApproval: true,
      amountDeltaIsNotSavings: true,
      canonicalMutationExecuted: false,
      laudusMutationExecuted: false,
    },
  };
}
