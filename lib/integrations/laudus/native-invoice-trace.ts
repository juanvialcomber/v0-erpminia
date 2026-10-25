import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaudusReadOnly, LaudusApiError } from './client';

const MAX_NATIVE_INVOICES = 5;
const MAX_NATIVE_CALLS = 10;
const QUERY_CHUNK = 50;

type OpenInvoice = {
  purchase_invoice_external_id: string;
  doc_number: string | null;
  supplier_name: string | null;
  outstanding_amount: number | string | null;
  currency: string | null;
};

type TraceDto = {
  traceId?: number | null;
  fromStep?: string | null;
  fromId?: number | string | null;
};

type TraceToDto = {
  toStep?: string | null;
  toId?: string | null;
  toDocNumber?: number | null;
};

type PurchaseInvoiceItemDto = {
  itemId?: number | null;
  product?: {
    productId?: number | null;
    sku?: string | null;
    description?: string | null;
    unitOfMeasure?: string | null;
  } | null;
  itemDescription?: string | null;
  quantity?: number | null;
  unitCost?: number | null;
  originalUnitCost?: number | null;
  currencyCode?: string | null;
  costCenter?: unknown;
  traceFrom?: TraceDto[] | null;
};

type PurchaseInvoiceDto = {
  purchaseInvoiceId?: number | null;
  docNumber?: number | null;
  issuedDate?: string | null;
  supplier?: unknown;
  items?: PurchaseInvoiceItemDto[] | null;
};

type PurchaseOrderRow = {
  external_id: string;
  order_number: string | null;
  issued_date: string | null;
  total_amount: number | string | null;
  currency: string | null;
};

function num(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeIntegerId(value: unknown) {
  const text = String(value ?? '').trim();
  return /^\d{1,9}$/.test(text) ? text : null;
}

function chunk<T>(rows: T[], size = QUERY_CHUNK) {
  const result: T[][] = [];
  for (let i = 0; i < rows.length; i += size) result.push(rows.slice(i, i + size));
  return result;
}

function parseInvoice(payload: unknown): PurchaseInvoiceDto | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return payload as PurchaseInvoiceDto;
}

function parseTraceTo(payload: unknown): TraceToDto[] {
  return Array.isArray(payload)
    ? payload.filter((row): row is TraceToDto => Boolean(row) && typeof row === 'object')
    : [];
}

export async function loadLaudusNativeInvoiceTrace(
  db: SupabaseClient,
  organizationId: string,
) {
  const openResult = await db
    .schema('integration')
    .from('laudus_purchase_invoice_payment_status_v1')
    .select('purchase_invoice_external_id,doc_number,supplier_name,outstanding_amount,currency')
    .eq('organization_id', organizationId)
    .in('payment_status', ['unpaid', 'partially_paid'])
    .order('outstanding_amount', { ascending: false })
    .limit(25);

  if (openResult.error) throw new Error(openResult.error.message);
  const openRows = (openResult.data || []) as OpenInvoice[];
  if (!openRows.length) {
    return {
      summary: { examined: 0, nativeLookups: 0, detailRecovered: 0, withNativeTrace: 0, withConfirmedPo: 0, apiCalls: 0 },
      invoices: [],
      readOnly: true,
    };
  }

  const invoiceIds = openRows.map((row) => row.purchase_invoice_external_id);
  const stagedLineInvoices = new Set<string>();
  for (const ids of chunk(invoiceIds)) {
    const result = await db
      .schema('integration')
      .from('laudus_purchase_invoice_lines')
      .select('invoice_external_id')
      .eq('organization_id', organizationId)
      .in('invoice_external_id', ids);
    if (result.error) throw new Error(result.error.message);
    for (const row of result.data || []) stagedLineInvoices.add(String(row.invoice_external_id || ''));
  }

  const missing = openRows
    .filter((row) => !stagedLineInvoices.has(row.purchase_invoice_external_id))
    .slice(0, MAX_NATIVE_INVOICES);

  const sourceRows: Array<{
    invoice: OpenInvoice;
    detail: PurchaseInvoiceDto | null;
    traceTo: TraceToDto[];
    sourceError: string | null;
  }> = [];

  let apiCalls = 0;
  for (const invoice of missing) {
    const id = safeIntegerId(invoice.purchase_invoice_external_id);
    if (!id || apiCalls >= MAX_NATIVE_CALLS) continue;

    let detail: PurchaseInvoiceDto | null = null;
    let traceTo: TraceToDto[] = [];
    let sourceError: string | null = null;

    try {
      detail = parseInvoice(await getLaudusReadOnly(`/purchases/invoices/${id}`));
      apiCalls += 1;

      const hasItemTrace = (detail?.items || []).some(
        (item) => Array.isArray(item.traceFrom) && item.traceFrom.length > 0,
      );

      if (!hasItemTrace && apiCalls < MAX_NATIVE_CALLS) {
        traceTo = parseTraceTo(
          await getLaudusReadOnly(`/purchases/invoices/${id}/traceTo`),
        );
        apiCalls += 1;
      }
    } catch (error) {
      sourceError =
        error instanceof LaudusApiError
          ? `HTTP ${error.status}`
          : error instanceof Error
            ? error.message
            : 'Laudus no respondió';
    }

    sourceRows.push({ invoice, detail, traceTo, sourceError });
  }

  const traceIds = new Set<string>();
  for (const row of sourceRows) {
    for (const item of row.detail?.items || []) {
      for (const trace of item.traceFrom || []) {
        const id = safeIntegerId(trace.fromId);
        if (id) traceIds.add(id);
      }
    }
    for (const trace of row.traceTo) {
      const id = safeIntegerId(trace.toId);
      if (id) traceIds.add(id);
    }
  }

  const ordersById = new Map<string, PurchaseOrderRow>();
  for (const ids of chunk([...traceIds])) {
    if (!ids.length) continue;
    const result = await db
      .schema('integration')
      .from('laudus_purchase_orders')
      .select('external_id,order_number,issued_date,total_amount,currency')
      .eq('organization_id', organizationId)
      .in('external_id', ids);
    if (result.error) throw new Error(result.error.message);
    for (const row of result.data || []) {
      ordersById.set(String(row.external_id), row as PurchaseOrderRow);
    }
  }

  const invoices = sourceRows.map((row) => {
    const itemTraceIds = new Set<string>();
    for (const item of row.detail?.items || []) {
      for (const trace of item.traceFrom || []) {
        const id = safeIntegerId(trace.fromId);
        if (id) itemTraceIds.add(id);
      }
    }
    const documentTraceIds = new Set<string>();
    for (const trace of row.traceTo) {
      const id = safeIntegerId(trace.toId);
      if (id) documentTraceIds.add(id);
    }

    const confirmed = [...new Set([...itemTraceIds, ...documentTraceIds])]
      .map((id) => {
        const order = ordersById.get(id);
        if (!order) return null;
        return {
          purchaseOrderExternalId: order.external_id,
          orderNumber: order.order_number,
          issuedDate: order.issued_date,
          totalAmount: num(order.total_amount),
          currency: order.currency,
          evidence:
            itemTraceIds.has(id) && documentTraceIds.has(id)
              ? 'item_and_document_trace'
              : itemTraceIds.has(id)
                ? 'item_trace'
                : 'document_trace',
        };
      })
      .filter((value): value is NonNullable<typeof value> => Boolean(value));

    const nativeTraceCount = itemTraceIds.size + documentTraceIds.size;
    const itemCount = Array.isArray(row.detail?.items) ? row.detail!.items!.length : 0;

    return {
      invoiceExternalId: row.invoice.purchase_invoice_external_id,
      docNumber: row.invoice.doc_number,
      supplierName: row.invoice.supplier_name,
      outstandingAmount: num(row.invoice.outstanding_amount),
      currency: row.invoice.currency,
      sourceDetailAvailable: Boolean(row.detail),
      itemCount,
      nativeTraceCount,
      confirmedPurchaseOrders: confirmed,
      unclassifiedTraceCount: Math.max(0, nativeTraceCount - confirmed.length),
      sourceError: row.sourceError,
    };
  });

  return {
    summary: {
      examined: openRows.length,
      nativeLookups: missing.length,
      detailRecovered: invoices.filter((row) => row.sourceDetailAvailable).length,
      withNativeTrace: invoices.filter((row) => row.nativeTraceCount > 0).length,
      withConfirmedPo: invoices.filter((row) => row.confirmedPurchaseOrders.length > 0).length,
      apiCalls,
    },
    invoices,
    readOnly: true,
    evidenceOrder: [
      'laudus_item_trace',
      'laudus_document_trace',
      'deterministic_candidate',
      'insufficient_evidence',
    ],
    semantics: {
      nativeTraceOverridesHeuristic: true,
      sourceTraceIsNotPaymentApproval: true,
      persisted: false,
      canonicalMutationExecuted: false,
      laudusMutationExecuted: false,
    },
  };
}
