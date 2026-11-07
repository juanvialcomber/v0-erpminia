import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaudusReadOnly, LaudusApiError } from './client';

const MAX_NATIVE_INVOICES = 5;
const MAX_NATIVE_CALLS = 10;
const MAX_OPEN_TRACE_RECOVERY_PER_RUN = 12;
const MIN_LAUDUS_API_BUDGET_RESERVE = 200;

type OpenInvoice = {
  purchase_invoice_external_id: string;
  laudus_purchase_invoice_id: number | string | null;
  doc_number: string | null;
  supplier_name: string | null;
  total_amount: number | string | null;
  paid_amount: number | string | null;
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
  dueDate?: string | null;
  totals?: { total?: number | string | null } | null;
  totalAmount?: number | string | null;
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


function invoiceDetailRows(detail: PurchaseInvoiceDto) {
  const base = {
    purchaseInvoiceId: detail.purchaseInvoiceId ?? null,
    docNumber: detail.docNumber ?? null,
    issuedDate: detail.issuedDate ?? null,
    dueDate: detail.dueDate ?? null,
    totals_total: detail.totals?.total ?? detail.totalAmount ?? null,
  };

  const items = Array.isArray(detail.items) ? detail.items : [];
  if (!items.length) return [base];

  return items.map((item) => ({
    ...base,
    items_itemId: item.itemId ?? null,
    items_quantity: item.quantity ?? null,
    items_unitCost: item.unitCost ?? null,
  }));
}

function invoiceTraceRows(detail: PurchaseInvoiceDto) {
  return (detail.items || []).flatMap((item) =>
    (item.traceFrom || []).map((trace) => ({
      invoiceItemId: item.itemId ?? null,
      traceId: trace.traceId ?? null,
      originStep: trace.fromStep ?? null,
      originId: trace.fromId ?? null,
      originDocNumber: trace.fromDocNumber ?? null,
    })),
  );
}

export async function recoverOpenInvoiceTraces(
  db: SupabaseClient,
  organizationId: string,
) {
  const budgetResult = await db
    .from('laudus_api_budget_service_v1')
    .select('tracked_remaining,monthly_remaining_exact')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const remaining = Number(budgetResult.data?.tracked_remaining ?? 0);
  const exact = budgetResult.data?.monthly_remaining_exact === true;
  const available = exact ? Math.max(0, remaining - MIN_LAUDUS_API_BUDGET_RESERVE) : 0;
  const limit = Math.min(MAX_OPEN_TRACE_RECOVERY_PER_RUN, available);

  if (limit <= 0) {
    return {
      estado: exact ? 'omitido_por_reserva_api' : 'omitido_presupuesto_no_exacto',
      candidatos: 0,
      recuperadas: 0,
      conTrazabilidadNativa: 0,
      sinTrazabilidadNativa: 0,
      lineasRecuperadas: 0,
      trazasPersistidas: 0,
      errores: 0,
      apiCalls: 0,
      presupuestoRestante: remaining,
      canonicalMutationExecuted: false,
      laudusMutationExecuted: false,
      stagingOnly: true,
    };
  }

  const openResult = await db
    .from('laudus_purchase_invoice_payment_status_service_v1')
    .select(
      'purchase_invoice_external_id,laudus_purchase_invoice_id,doc_number,supplier_name,total_amount,paid_amount,outstanding_amount,currency',
    )
    .eq('organization_id', organizationId)
    .in('payment_status', ['unpaid', 'partially_paid'])
    .order('issued_date', { ascending: false })
    .limit(2000);

  if (openResult.error) throw new Error(openResult.error.message);

  const openRows = (openResult.data || []) as OpenInvoice[];
  const externalIds = openRows
    .map((row) => String(row.purchase_invoice_external_id || '').trim())
    .filter(Boolean);

  let syncedRows: Array<{ invoice_external_id: string; status: string | null }> = [];
  if (externalIds.length) {
    const statusResult = await db.rpc('motil_get_laudus_invoice_trace_status_v1', {
      p_organization_id: organizationId,
      p_invoice_external_ids: externalIds,
    });
    if (statusResult.error) throw new Error('No se pudo verificar el estado de trazabilidad de facturas.');
    syncedRows = (statusResult.data || []) as Array<{ invoice_external_id: string; status: string | null }>;
  }

  const complete = new Set(
    syncedRows
      .filter((row) => row.status === 'complete')
      .map((row) => String(row.invoice_external_id)),
  );

  const pending = openRows
    .filter((row) => {
      const missingTotal = row.total_amount == null;
      const hasPayments = num(row.paid_amount) > 0;
      if (missingTotal && hasPayments) return false;
      return missingTotal || !complete.has(String(row.purchase_invoice_external_id));
    })
    .sort((a, b) => {
      const aUnknownUnpaid = a.total_amount == null && num(a.paid_amount) <= 0 ? 1 : 0;
      const bUnknownUnpaid = b.total_amount == null && num(b.paid_amount) <= 0 ? 1 : 0;
      if (aUnknownUnpaid !== bUnknownUnpaid) return bUnknownUnpaid - aUnknownUnpaid;
      return num(b.outstanding_amount) - num(a.outstanding_amount);
    })
    .slice(0, limit);

  let recovered = 0;
  let withTrace = 0;
  let withoutTrace = 0;
  let recoveredLines = 0;
  let tracesPersisted = 0;
  let errors = 0;
  let apiCalls = 0;

  for (const invoice of pending) {
    const sourceId = safeIntegerId(invoice.laudus_purchase_invoice_id);
    if (!sourceId) {
      errors += 1;
      continue;
    }

    try {
      apiCalls += 1;
      const detail = parseInvoice(await getLaudusReadOnly('/purchases/invoices/' + sourceId));
      if (!detail) {
        errors += 1;
        continue;
      }

      const rows = invoiceDetailRows(detail);
      const traces = invoiceTraceRows(detail);

      const ingestRows = await db.rpc('motil_ingest_laudus_invoice_rows', {
        p_organization_id: organizationId,
        p_rows: rows,
      });
      if (ingestRows.error) throw new Error('No se pudieron persistir las líneas de factura.');

      const ingestTraces = await db.rpc('motil_ingest_laudus_invoice_traces', {
        p_organization_id: organizationId,
        p_invoice_external_id: String(invoice.purchase_invoice_external_id),
        p_laudus_purchase_invoice_id: Number(sourceId),
        p_traces: traces,
      });
      if (ingestTraces.error) throw new Error('No se pudieron persistir las trazas de factura.');

      recovered += 1;
      recoveredLines += Array.isArray(detail.items) ? detail.items.length : 0;
      tracesPersisted += traces.length;
      if (traces.length > 0) withTrace += 1;
      else withoutTrace += 1;
    } catch {
      errors += 1;
    }
  }

  return {
    estado: errors > 0 ? 'parcial' : 'completado',
    candidatos: pending.length,
    recuperadas: recovered,
    conTrazabilidadNativa: withTrace,
    sinTrazabilidadNativa: withoutTrace,
    lineasRecuperadas: recoveredLines,
    trazasPersistidas,
    errores: errors,
    apiCalls,
    presupuestoRestante: remaining,
    canonicalMutationExecuted: false,
    laudusMutationExecuted: false,
    stagingOnly: true,
    evidencePolicy: 'solo_traceFrom',
  };
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
