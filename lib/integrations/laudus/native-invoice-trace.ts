import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaudusReadOnly, LaudusApiError } from './client';

const MAX_NATIVE_INVOICES = 5;
const MAX_NATIVE_CALLS = 10;

type OpenInvoice = {
  purchase_invoice_external_id: string;
  laudus_purchase_invoice_id: number | string | null;
  doc_number: string | null;
  supplier_name: string | null;
  outstanding_amount: number | string | null;
  currency: string | null;
};

type TraceDto = {
  traceId?: number | null;
  fromStep?: string | null;
  fromId?: number | string | null;
  fromDocNumber?: number | string | null;
};

type TraceToDto = {
  toStep?: string | null;
  toId?: string | null;
  toDocNumber?: number | string | null;
};

type PurchaseInvoiceItemDto = {
  itemId?: number | null;
  quantity?: number | null;
  unitCost?: number | null;
  traceFrom?: TraceDto[] | null;
};

type PurchaseInvoiceDto = {
  purchaseInvoiceId?: number | null;
  docNumber?: number | null;
  issuedDate?: string | null;
  items?: PurchaseInvoiceItemDto[] | null;
};

function num(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeIntegerId(value: unknown) {
  const text = String(value ?? '').trim();
  return /^\d{1,12}$/.test(text) ? text : null;
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
    .from('laudus_purchase_invoice_payment_status_service_v1')
    .select(
      'purchase_invoice_external_id,laudus_purchase_invoice_id,doc_number,supplier_name,outstanding_amount,currency',
    )
    .eq('organization_id', organizationId)
    .in('payment_status', ['unpaid', 'partially_paid'])
    .order('outstanding_amount', { ascending: false })
    .limit(MAX_NATIVE_INVOICES);

  if (openResult.error) throw new Error(openResult.error.message);
  const openRows = (openResult.data || []) as OpenInvoice[];

  const invoices: Array<{
    invoiceExternalId: string;
    docNumber: string | null;
    supplierName: string | null;
    outstandingAmount: number;
    currency: string | null;
    sourceDetailAvailable: boolean;
    itemCount: number;
    nativeTraceCount: number;
    traceAtItemLevel: boolean;
    traceAtDocumentLevel: boolean;
    sourceError: string | null;
  }> = [];

  let apiCalls = 0;

  for (const invoice of openRows) {
    if (apiCalls >= MAX_NATIVE_CALLS) break;
    const sourceId = safeIntegerId(invoice.laudus_purchase_invoice_id);

    if (!sourceId) {
      invoices.push({
        invoiceExternalId: invoice.purchase_invoice_external_id,
        docNumber: invoice.doc_number,
        supplierName: invoice.supplier_name,
        outstandingAmount: num(invoice.outstanding_amount),
        currency: invoice.currency,
        sourceDetailAvailable: false,
        itemCount: 0,
        nativeTraceCount: 0,
        traceAtItemLevel: false,
        traceAtDocumentLevel: false,
        sourceError: 'Sin identificador fuente',
      });
      continue;
    }

    let detail: PurchaseInvoiceDto | null = null;
    let traceTo: TraceToDto[] = [];
    let sourceError: string | null = null;

    try {
      detail = parseInvoice(await getLaudusReadOnly(`/purchases/invoices/${sourceId}`));
      apiCalls += 1;

      const hasItemTrace = (detail?.items || []).some(
        (item) => Array.isArray(item.traceFrom) && item.traceFrom.length > 0,
      );

      if (!hasItemTrace && apiCalls < MAX_NATIVE_CALLS) {
        traceTo = parseTraceTo(
          await getLaudusReadOnly(`/purchases/invoices/${sourceId}/traceTo`),
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

    const itemTraces = (detail?.items || []).flatMap((item) => item.traceFrom || []);
    const itemTraceIds = new Set(
      itemTraces.map((trace) => safeIntegerId(trace.fromId)).filter(Boolean),
    );
    const documentTraceIds = new Set(
      traceTo.map((trace) => safeIntegerId(trace.toId)).filter(Boolean),
    );

    invoices.push({
      invoiceExternalId: invoice.purchase_invoice_external_id,
      docNumber: invoice.doc_number,
      supplierName: invoice.supplier_name,
      outstandingAmount: num(invoice.outstanding_amount),
      currency: invoice.currency,
      sourceDetailAvailable: Boolean(detail),
      itemCount: Array.isArray(detail?.items) ? detail!.items!.length : 0,
      nativeTraceCount: itemTraceIds.size + documentTraceIds.size,
      traceAtItemLevel: itemTraceIds.size > 0,
      traceAtDocumentLevel: documentTraceIds.size > 0,
      sourceError,
    });
  }

  return {
    summary: {
      examined: openRows.length,
      detailRecovered: invoices.filter((row) => row.sourceDetailAvailable).length,
      withLines: invoices.filter((row) => row.itemCount > 0).length,
      withNativeTrace: invoices.filter((row) => row.nativeTraceCount > 0).length,
      missingEvidence: invoices.filter(
        (row) => !row.sourceDetailAvailable || row.nativeTraceCount === 0,
      ).length,
      apiCalls,
    },
    invoices,
    readOnly: true,
    evidenceOrder: [
      'laudus_item_trace',
      'laudus_document_trace',
      'insufficient_evidence',
    ],
    semantics: {
      sourceTraceTypeUnclassified: true,
      sourceTraceIsNotPurchaseOrderConfirmation: true,
      sourceTraceIsNotPaymentApproval: true,
      persisted: false,
      canonicalMutationExecuted: false,
      laudusMutationExecuted: false,
    },
  };
}
