import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaudusReadOnly, LaudusApiError } from '@/lib/integrations/laudus/client';
import { LEGAL_PROGRESS_MILESTONES } from '@/lib/legal/contract-progress-source';

const MAX_LEGAL_TRACE_RECOVERY = 8;

type PurchaseInvoiceDetail = {
  purchaseInvoiceId?: number | string | null;
  docNumber?: number | string | null;
  issuedDate?: string | null;
  dueDate?: string | null;
  supplier?: { supplierId?: number | string | null; name?: string | null; legalName?: string | null; VATId?: string | null } | null;
  warehouse?: { warehouseId?: number | string | null; name?: string | null } | null;
  items?: Array<{
    itemId?: number | string | null;
    product?: { productId?: number | string | null; sku?: string | null; description?: string | null; unitOfMeasure?: string | null } | null;
    quantity?: number | string | null;
    unitCost?: number | string | null;
    traceFrom?: Array<{ traceId?: number | string | null; fromStep?: string | null; fromId?: number | string | null; fromDocNumber?: number | string | null }> | null;
  }> | null;
};

function normalize(value: string | null | undefined) {
  return String(value || '').replace(/[^0-9A-Z]/gi, '').toUpperCase();
}

function detailRows(detail: PurchaseInvoiceDetail) {
  const base = {
    purchaseInvoiceId: detail.purchaseInvoiceId ?? null,
    docNumber: detail.docNumber ?? null,
    issuedDate: detail.issuedDate ?? null,
    dueDate: detail.dueDate ?? null,
    supplier_supplierId: detail.supplier?.supplierId ?? null,
    supplier_name: detail.supplier?.name ?? null,
    supplier_legalName: detail.supplier?.legalName ?? null,
    supplier_VATId: detail.supplier?.VATId ?? null,
    warehouse_warehouseId: detail.warehouse?.warehouseId ?? null,
    warehouse_name: detail.warehouse?.name ?? null,
  };
  const items = Array.isArray(detail.items) ? detail.items : [];
  if (!items.length) return [base];
  return items.map((item) => ({
    ...base,
    items_itemId: item.itemId ?? null,
    items_product_productId: item.product?.productId ?? null,
    items_product_sku: item.product?.sku ?? null,
    items_product_description: item.product?.description ?? null,
    items_product_unitOfMeasure: item.product?.unitOfMeasure ?? null,
    items_quantity: item.quantity ?? null,
    items_unitCost: item.unitCost ?? null,
  }));
}

function detailTraces(detail: PurchaseInvoiceDetail) {
  return (detail.items || []).flatMap((item) =>
    (item.traceFrom || []).map((trace) => ({
      originStep: trace.fromStep ?? null,
      originId: trace.fromId ?? null,
      originDocNumber: trace.fromDocNumber ?? null,
      traceId: trace.traceId ?? null,
      invoiceItemId: item.itemId ?? null,
    })),
  );
}

export async function syncLegalContractInvoiceTraces(organizationId: string, db: SupabaseClient, options: { recover?: boolean } = {}) {
  const contractNumbers = [...new Set(LEGAL_PROGRESS_MILESTONES.map((row) => row.contractNumber))];
  const invoiceRefs = LEGAL_PROGRESS_MILESTONES.flatMap((milestone) =>
    milestone.invoices.map((invoice) => ({ contractNumber: milestone.contractNumber, docNumber: invoice.docNumber })),
  );
  if (!invoiceRefs.length) return {
    examined: 0,
    matched: 0,
    ambiguous: 0,
    missing: 0,
    alreadySynced: 0,
    recoverable: 0,
    nextBatch: 0,
    recovered: 0,
    recoveredLines: 0,
    recoveredTraces: 0,
    apiCalls: 0,
    remaining: 0,
    errors: [],
    canonicalMutationExecuted: false,
    laudusMutationExecuted: false,
    stagingOnly: true,
    dryRun: options.recover === false,
  };

  const { data: contracts, error: contractsError } = await db
    .from('contracts').select('id,contract_number,supplier_id')
    .eq('organization_id', organizationId).in('contract_number', contractNumbers);
  if (contractsError) throw new Error('No se pudieron resolver contratos Legal');

  const supplierIds = [...new Set((contracts || []).map((row) => row.supplier_id).filter(Boolean))] as string[];
  const { data: suppliers, error: suppliersError } = supplierIds.length
    ? await db.from('suppliers').select('id,rut').eq('organization_id', organizationId).in('id', supplierIds)
    : { data: [], error: null };
  if (suppliersError) throw new Error('No se pudieron resolver proveedores Legal');

  const supplierRutById = new Map((suppliers || []).map((row) => [row.id, normalize(row.rut)]));
  const contractByNumber = new Map((contracts || []).map((row) => [String(row.contract_number), row]));
  const docNumbers = [...new Set(invoiceRefs.map((row) => row.docNumber))];

  const { data: observed, error: observedError } = await db
    .from('laudus_purchase_invoice_payment_status_service_v1')
    .select('purchase_invoice_external_id,laudus_purchase_invoice_id,doc_number,supplier_external_id,supplier_name,total_amount')
    .eq('organization_id', organizationId).in('doc_number', docNumbers).limit(2000);
  if (observedError) throw new Error('No se pudieron resolver facturas observadas');

  const externalIds = [...new Set((observed || []).map((row) => row.purchase_invoice_external_id).filter(Boolean))] as string[];
  const { data: invoiceIdentity, error: identityError } = externalIds.length
    ? await db.from('laudus_purchase_invoices_service_v1').select('external_id,supplier_tax_id')
        .eq('organization_id', organizationId).in('external_id', externalIds)
    : { data: [], error: null };
  if (identityError) throw new Error('No se pudo verificar identidad de facturas');

  const supplierTaxByExternalId = new Map((invoiceIdentity || []).map((row) => [String(row.external_id), normalize(row.supplier_tax_id)]));
  const candidates: Array<{ contractNumber: string; docNumber: string; invoiceExternalId: string; laudusPurchaseInvoiceId: number }> = [];
  let ambiguous = 0;
  let missing = 0;

  for (const ref of invoiceRefs) {
    const contract = contractByNumber.get(ref.contractNumber);
    const expectedRut = contract?.supplier_id ? supplierRutById.get(contract.supplier_id) : null;
    if (!expectedRut) { missing += 1; continue; }
    const matches = (observed || []).filter((row) =>
      String(row.doc_number || '').trim() === ref.docNumber &&
      supplierTaxByExternalId.get(String(row.purchase_invoice_external_id)) === expectedRut &&
      Number(row.total_amount || 0) > 0 &&
      Number.isFinite(Number(row.laudus_purchase_invoice_id)),
    );
    if (matches.length === 1) {
      candidates.push({
        contractNumber: ref.contractNumber,
        docNumber: ref.docNumber,
        invoiceExternalId: String(matches[0].purchase_invoice_external_id),
        laudusPurchaseInvoiceId: Number(matches[0].laudus_purchase_invoice_id),
      });
    } else if (matches.length > 1) ambiguous += 1;
    else missing += 1;
  }

  const deduped = [...new Map(candidates.map((row) => [row.invoiceExternalId, row])).values()];
  const { data: traceStatus, error: traceStatusError } = deduped.length
    ? await db.rpc('motil_get_laudus_invoice_trace_status_v1', {
        p_organization_id: organizationId,
        p_invoice_external_ids: deduped.map((row) => row.invoiceExternalId),
      })
    : { data: [], error: null };
  if (traceStatusError) throw new Error('No se pudo verificar estado de trazas');

  const alreadySynced = new Set((traceStatus || []).filter((row: any) => row.status === 'complete').map((row: any) => String(row.invoice_external_id)));
  const unsynced = deduped.filter((row) => !alreadySynced.has(row.invoiceExternalId));
  const pending = unsynced.slice(0, MAX_LEGAL_TRACE_RECOVERY);

  if (options.recover === false) {
    return {
      examined: invoiceRefs.length,
      matched: deduped.length,
      ambiguous,
      missing,
      alreadySynced: alreadySynced.size,
      recoverable: unsynced.length,
      nextBatch: pending.length,
      recovered: 0,
      recoveredLines: 0,
      recoveredTraces: 0,
      apiCalls: 0,
      remaining: unsynced.length,
      errors: [],
      canonicalMutationExecuted: false,
      laudusMutationExecuted: false,
      stagingOnly: true,
      dryRun: true,
    };
  }

  let recovered = 0;
  let apiCalls = 0;
  let recoveredLines = 0;
  let recoveredTraces = 0;
  const errors: Array<{ invoiceExternalId: string; reason: string }> = [];

  for (const candidate of pending) {
    try {
      const raw = await getLaudusReadOnly('/purchases/invoices/' + candidate.laudusPurchaseInvoiceId);
      apiCalls += 1;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
        errors.push({ invoiceExternalId: candidate.invoiceExternalId, reason: 'Detalle de factura inválido' });
        continue;
      }
      const detail = raw as PurchaseInvoiceDetail;
      const rows = detailRows(detail);
      const traces = detailTraces(detail);

      const ingestRows = await db.rpc('motil_ingest_laudus_invoice_rows', { p_organization_id: organizationId, p_rows: rows });
      if (ingestRows.error) throw new Error('No se pudieron persistir líneas de factura');

      const ingestTraces = await db.rpc('motil_ingest_laudus_invoice_traces', {
        p_organization_id: organizationId,
        p_invoice_external_id: candidate.invoiceExternalId,
        p_laudus_purchase_invoice_id: candidate.laudusPurchaseInvoiceId,
        p_traces: traces,
      });
      if (ingestTraces.error) throw new Error('No se pudieron persistir trazas de factura');

      recovered += 1;
      recoveredLines += Array.isArray(detail.items) ? detail.items.length : 0;
      recoveredTraces += traces.length;
    } catch (error) {
      errors.push({
        invoiceExternalId: candidate.invoiceExternalId,
        reason: error instanceof LaudusApiError ? 'HTTP ' + error.status : error instanceof Error ? error.message : 'Error de recuperación',
      });
    }
  }

  return {
    examined: invoiceRefs.length,
    matched: deduped.length,
    ambiguous,
    missing,
    alreadySynced: alreadySynced.size,
    recovered,
    recoveredLines,
    recoveredTraces,
    apiCalls,
    remaining: Math.max(0, deduped.length - alreadySynced.size - pending.length),
    errors,
    canonicalMutationExecuted: false,
    laudusMutationExecuted: false,
    stagingOnly: true,
  };
}
