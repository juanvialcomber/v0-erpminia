import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaudusReadOnly } from '@/lib/integrations/laudus/client';

const MAX_OPEN_INVOICE_DETAILS_PER_RUN = 12;
const MIN_LAUDUS_API_BUDGET_RESERVE = 200;

type OpenInvoice = {
  purchase_invoice_external_id: string;
  laudus_purchase_invoice_id: number | string | null;
  doc_number: string | null;
  supplier_external_id: string | null;
  issued_date: string | null;
  outstanding_amount: number | string | null;
  payment_status: string | null;
};

type PurchaseInvoiceDetail = {
  purchaseInvoiceId?: number | null;
  docNumber?: number | null;
  issuedDate?: string | null;
  dueDate?: string | null;
  supplier?: {
    supplierId?: number | string | null;
    name?: string | null;
    legalName?: string | null;
    VATId?: string | null;
  } | null;
  warehouse?: {
    warehouseId?: number | string | null;
    name?: string | null;
  } | null;
  totals?: { total?: number | string | null } | null;
  totalAmount?: number | string | null;
  items?: Array<{
    itemId?: number | null;
    product?: {
      productId?: number | string | null;
      sku?: string | null;
      description?: string | null;
      unitOfMeasure?: string | null;
    } | null;
    quantity?: number | string | null;
    unitCost?: number | string | null;
  }> | null;
};

function safeIntegerId(value: unknown) {
  const text = String(value ?? '').trim();
  return /^\d{1,12}$/.test(text) ? text : null;
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
    totals_total: detail.totals?.total ?? detail.totalAmount ?? null,
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

export async function recoverOpenInvoiceDetails(
  db: SupabaseClient,
  organizationId: string,
) {
  const budgetResult = await db
    .from('laudus_api_budget_service_v1')
    .select('tracked_remaining,monthly_remaining_exact')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (budgetResult.error) throw new Error('No se pudo verificar el presupuesto Laudus.');

  const remaining = Number(budgetResult.data?.tracked_remaining ?? 0);
  const exact = budgetResult.data?.monthly_remaining_exact === true;
  const available = exact ? Math.max(0, remaining - MIN_LAUDUS_API_BUDGET_RESERVE) : 0;
  const limit = Math.min(MAX_OPEN_INVOICE_DETAILS_PER_RUN, available);

  if (limit <= 0) {
    return {
      estado: exact ? 'omitido_por_reserva_api' : 'omitido_presupuesto_no_exacto',
      candidatos: 0,
      recuperadas: 0,
      conLineas: 0,
      sinLineas: 0,
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
    .select('purchase_invoice_external_id,laudus_purchase_invoice_id,doc_number,supplier_external_id,issued_date,outstanding_amount,payment_status')
    .eq('organization_id', organizationId)
    .in('payment_status', ['unpaid', 'partially_paid'])
    .order('outstanding_amount', { ascending: false })
    .limit(200);

  if (openResult.error) throw new Error(openResult.error.message);

  const openRows = (openResult.data || []) as OpenInvoice[];
  const openIds = openRows
    .map((row) => String(row.purchase_invoice_external_id || '').trim())
    .filter(Boolean);

  const existingLineInvoiceIds = new Set<string>();
  for (let offset = 0; offset < openIds.length; offset += 50) {
    const ids = openIds.slice(offset, offset + 50);
    const lineResult = await db
      .schema('integration')
      .from('laudus_purchase_invoice_lines')
      .select('invoice_external_id')
      .eq('organization_id', organizationId)
      .in('invoice_external_id', ids);

    if (lineResult.error) throw new Error('No se pudo verificar cobertura de líneas Laudus.');
    for (const row of lineResult.data || []) {
      const id = String(row.invoice_external_id || '').trim();
      if (id) existingLineInvoiceIds.add(id);
    }
  }

  const missingLineRows = openRows
    .filter((row) => !existingLineInvoiceIds.has(String(row.purchase_invoice_external_id)));

  const supplierIds = [...new Set(
    missingLineRows
      .map((row) => String(row.supplier_external_id || '').trim())
      .filter(Boolean),
  )];

  const candidateOrderDatesBySupplier = new Map<string, number[]>();
  for (let offset = 0; offset < supplierIds.length; offset += 50) {
    const suppliers = supplierIds.slice(offset, offset + 50);
    const orderResult = await db
      .schema('integration')
      .from('laudus_purchase_orders')
      .select('supplier_external_id,issued_date')
      .eq('organization_id', organizationId)
      .in('supplier_external_id', suppliers)
      .order('issued_date', { ascending: false })
      .limit(1000);

    if (orderResult.error) throw new Error('No se pudo verificar contexto de OC Laudus.');

    for (const row of orderResult.data || []) {
      const supplierId = String(row.supplier_external_id || '').trim();
      const issuedAt = Date.parse(String(row.issued_date || ''));
      if (!supplierId || !Number.isFinite(issuedAt)) continue;
      const dates = candidateOrderDatesBySupplier.get(supplierId) || [];
      dates.push(issuedAt);
      candidateOrderDatesBySupplier.set(supplierId, dates);
    }
  }

  const hasCandidatePurchaseOrder = (row: OpenInvoice) => {
    const supplierId = String(row.supplier_external_id || '').trim();
    const invoiceAt = Date.parse(String(row.issued_date || ''));
    if (!supplierId || !Number.isFinite(invoiceAt)) return false;
    const minAt = invoiceAt - 180 * 24 * 60 * 60 * 1000;
    return (candidateOrderDatesBySupplier.get(supplierId) || [])
      .some((issuedAt) => issuedAt >= minAt && issuedAt <= invoiceAt);
  };

  const prioritized = missingLineRows
    .filter((row) => hasCandidatePurchaseOrder(row));

  const candidates = prioritized.slice(0, limit);

  let recovered = 0;
  let withLines = 0;
  let withoutLines = 0;
  let errors = 0;
  let apiCalls = 0;

  for (const invoice of candidates) {
    const sourceId = safeIntegerId(invoice.laudus_purchase_invoice_id);
    if (!sourceId) {
      errors += 1;
      continue;
    }

    try {
      apiCalls += 1;
      const payload = await getLaudusReadOnly('/purchases/invoices/' + sourceId);
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        errors += 1;
        continue;
      }

      const detail = payload as PurchaseInvoiceDetail;
      const rows = detailRows(detail);
      const ingest = await db.rpc('motil_ingest_laudus_invoice_rows', {
        p_organization_id: organizationId,
        p_rows: rows,
      });
      if (ingest.error) throw new Error('No se pudo persistir el detalle de factura Laudus.');

      recovered += 1;
      if (Array.isArray(detail.items) && detail.items.length > 0) withLines += 1;
      else withoutLines += 1;
    } catch {
      errors += 1;
    }
  }

  return {
    estado: errors > 0 ? 'parcial' : 'completado',
    candidatos: candidates.length,
    recuperadas: recovered,
    conLineas: withLines,
    sinLineas: withoutLines,
    errores: errors,
    apiCalls,
    presupuestoRestante: remaining,
    canonicalMutationExecuted: false,
    laudusMutationExecuted: false,
    stagingOnly: true,
    evidencePolicy: 'detail_rows_only',
  };
}
