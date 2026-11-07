import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaudusReadOnly, listLaudus, listLaudusWithOrderFallback } from '@/lib/integrations/laudus/client';
import { futureIssuedDateIncidents, reconcileFutureIssuedDateIncidents } from '@/lib/integrations/laudus/data-quality';
import { syncLegalContractInvoiceTraces } from '@/lib/legal/contract-invoice-trace-sync';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

type JsonRow = Record<string, any>;

const SUPPLIER_FIELDS = ['supplierId','name','legalName','VATId','email','phone','city'] as const;
const PURCHASE_ORDER_FIELDS = [
  'purchaseOrderId','issuedDate','dueDate','status',
  'supplier.supplierId','supplier.name','supplier.legalName','supplier.VATId',
  'warehouse.warehouseId','warehouse.name',
  'items.itemId','items.product.productId','items.product.sku','items.product.description',
  'items.product.unitOfMeasure','items.quantity','items.unitCost',
  'items.costCenter.costCenterId',
] as const;
const PURCHASE_INVOICE_FIELDS = [
  'purchaseInvoiceId','docNumber','issuedDate','dueDate',
  'supplier.supplierId','supplier.name','supplier.legalName','supplier.VATId',
  'warehouse.warehouseId','warehouse.name',
  'totals.total',
] as const;
const MAX_MISSING_INVOICE_RECOVERY_PER_RUN = 12;
const MIN_LAUDUS_API_BUDGET_RESERVE = 200;

const PURCHASE_PAYMENT_FIELDS = [
  'paymentId','issuedDate','dueDate','document','deposited',
  'paymentType.code','paymentType.description',
  'bank.bankId','bank.name','notes',
  'purchaseInvoices.itemId','purchaseInvoices.purchaseInvoiceId','purchaseInvoices.docNumber',
  'purchaseInvoices.supplier.supplierId','purchaseInvoices.supplier.name',
  'purchaseInvoices.originalAmount','purchaseInvoices.currencyCode',
  'purchaseInvoices.parityToMainCurrency','purchaseInvoices.amount',
  'purchaseInvoices.costCenter.costCenterId',
] as const;

function rowsFrom(payload: unknown): JsonRow[] {
  if (Array.isArray(payload)) return payload.filter((row): row is JsonRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  if (!payload || typeof payload !== 'object') return [];

  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'rows']) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((row): row is JsonRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    }
  }
  return [];
}

function supplierRow(row: JsonRow) {
  const term = row.term ?? row.paymentTerm ?? null;
  return {
    supplierId: row.supplierId ?? row.id ?? null,
    VATId: row.VATId ?? row.vatId ?? row.taxId ?? null,
    name: row.name ?? row.tradeName ?? null,
    legalName: row.legalName ?? row.businessName ?? row.name ?? null,
    address: typeof row.address === 'string' ? row.address : row.address?.address ?? row.address?.street ?? null,
    city: row.city ?? row.address?.city ?? row.county?.name ?? null,
    phone: row.phone ?? row.phone1 ?? null,
    email: row.email ?? null,
    term,
  };
}

function paymentRows(row: JsonRow): JsonRow[] {
  const invoices = Array.isArray(row.purchaseInvoices) ? row.purchaseInvoices : [];
  const base = {
    paymentId: row.paymentId ?? row.id ?? null,
    issuedDate: row.issuedDate ?? null,
    dueDate: row.dueDate ?? null,
    document: row.document ?? null,
    deposited: row.deposited ?? null,
    paymentType_code: row.paymentType?.code ?? null,
    paymentType_description: row.paymentType?.description ?? null,
    bank_bankId: row.bank?.bankId ?? null,
    bank_name: row.bank?.name ?? null,
    notes: row.notes ?? null,
  };

  if (invoices.length === 0) return [base];

  return invoices.map((invoice: JsonRow) => ({
    ...base,
    purchaseInvoices_itemId: invoice.itemId ?? null,
    purchaseInvoices_purchaseInvoiceId: invoice.purchaseInvoiceId ?? null,
    purchaseInvoices_docNumber: invoice.docNumber ?? null,
    purchaseInvoices_supplier_supplierId: invoice.supplier?.supplierId ?? null,
    purchaseInvoices_supplier_name: invoice.supplier?.name ?? null,
    purchaseInvoices_originalAmount: invoice.originalAmount ?? null,
    purchaseInvoices_currencyCode: invoice.currencyCode ?? null,
    purchaseInvoices_parityToMainCurrency: invoice.parityToMainCurrency ?? null,
    purchaseInvoices_amount: invoice.amount ?? null,
    purchaseInvoices_costCenter_costCenterId: invoice.costCenter?.costCenterId ?? null,
  }));
}

async function listRecent(path: string, orderField: string, fields: readonly string[], maxPages = 2) {
  const rows: JsonRow[] = [];
  let calls = 0;
  let partial = false;

  for (let page = 0; page < maxPages; page += 1) {
    const listed = await listLaudusWithOrderFallback(path, {
      options: { offset: page * 100, limit: 100 },
      fields: [...fields],
      orderBy: [{ field: orderField, direction: 'DESC' }],
    });
    calls += listed.apiCalls;
    const pageRows = rowsFrom(listed.payload);
    rows.push(...pageRows);

    if (pageRows.length < 100) return { rows, calls, partial: false };
    if (page === maxPages - 1) partial = true;
  }

  return { rows, calls, partial };
}

async function listAllSuppliers() {
  const rows: JsonRow[] = [];
  let calls = 0;
  let partial = false;

  for (let page = 0; page < 25; page += 1) {
    const payload = await listLaudus('/purchases/suppliers/list', {
      options: { offset: page * 100, limit: 100 },
      fields: [...SUPPLIER_FIELDS],
    });
    calls += 1;
    const pageRows = rowsFrom(payload);
    rows.push(...pageRows);

    if (pageRows.length < 100) return { rows, calls, partial: false };
    if (page === 24) partial = true;
  }

  return { rows, calls, partial };
}


function purchaseInvoiceDetailRows(detail: JsonRow): JsonRow[] {
  const base = {
    purchaseInvoiceId: detail.purchaseInvoiceId ?? detail.id ?? null,
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

  return items.map((item: JsonRow) => ({
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

export async function recoverMissingPurchaseInvoices(organizationId: string, db: SupabaseClient) {
  const budgetResult = await db
    .from('laudus_api_budget_service_v1')
    .select('tracked_remaining')
    .eq('organization_id', organizationId)
    .maybeSingle();

  const remaining = Number(budgetResult.data?.tracked_remaining ?? 0);
  const availableForRecovery = Math.max(0, remaining - MIN_LAUDUS_API_BUDGET_RESERVE);
  const limit = Math.min(MAX_MISSING_INVOICE_RECOVERY_PER_RUN, availableForRecovery);

  if (limit <= 0) {
    return {
      estado: 'omitido_por_presupuesto',
      candidatos: 0,
      recuperadas: 0,
      errores: 0,
      apiCalls: 0,
      presupuestoRestante: remaining,
    };
  }

  const candidatesResult = await db
    .from('laudus_missing_purchase_invoice_recovery_candidates_v1')
    .select('purchase_invoice_external_id,recovery_class')
    .eq('organization_id', organizationId)
    .order('recovery_priority', { ascending: true })
    .order('last_reference_synced_at', { ascending: false })
    .limit(limit);

  if (candidatesResult.error) {
    return {
      estado: 'cola_no_disponible',
      candidatos: 0,
      recuperadas: 0,
      errores: 1,
      apiCalls: 0,
      presupuestoRestante: remaining,
    };
  }

  const candidates = candidatesResult.data || [];
  let apiCalls = 0;
  let recovered = 0;
  let errors = 0;
  const porClase: Record<string, number> = {};

  for (const candidate of candidates) {
    const externalId = String(candidate.purchase_invoice_external_id || '').trim();
    if (!/^\d{1,12}$/.test(externalId)) {
      errors += 1;
      continue;
    }

    try {
      const detail = await getLaudusReadOnly('/purchases/invoices/' + externalId);
      apiCalls += 1;
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)) {
        errors += 1;
        continue;
      }

      const rows = purchaseInvoiceDetailRows(detail as JsonRow);
      const ingest = await db.rpc('motil_ingest_laudus_invoice_rows', {
        p_organization_id: organizationId,
        p_rows: rows,
      });
      if (ingest.error) {
        errors += 1;
        continue;
      }

      recovered += 1;
      const clase = String(candidate.recovery_class || 'sin_clasificar');
      porClase[clase] = (porClase[clase] || 0) + 1;
    } catch {
      apiCalls += 1;
      errors += 1;
    }
  }

  return {
    estado: errors > 0 ? 'parcial' : 'completado',
    candidatos: candidates.length,
    recuperadas: recovered,
    errores: errors,
    apiCalls,
    porClase,
    presupuestoRestante: remaining,
  };
}

async function ingestChunks(
  db: SupabaseClient,
  rpc: string,
  argsFactory: (chunk: JsonRow[]) => Record<string, unknown>,
  rows: JsonRow[],
  chunkSize = 500,
) {
  let processed = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await db.rpc(rpc, argsFactory(chunk));
    if (error) throw new Error(`${rpc} failed`);
    processed += chunk.length;
  }
  return processed;
}

export async function syncLaudusSuppliers(organizationId: string, db: SupabaseClient) {
  await markLaudusSyncRunning(db, organizationId, 'suppliers');
  let apiCalls = 0;

  try {
    const listed = await listAllSuppliers();
    apiCalls += listed.calls;
    const normalized = listed.rows.map(supplierRow).filter((row) => row.supplierId != null);

    const processed = await ingestChunks(
      db,
      'motil_ingest_laudus_suppliers',
      (chunk) => ({ p_organization_id: organizationId, p_rows: chunk }),
      normalized,
    );

    await markLaudusSyncSuccess(db, organizationId, 'suppliers', {
      processed,
      changed: 0,
      apiCalls,
      metadata: { partial: listed.partial, mode: 'weekly_full_read_only' },
    });

    return { organizationId, status: listed.partial ? 'partial' : 'completed', processed, apiCalls, partial: listed.partial };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'suppliers', error, { apiCalls });
    throw error;
  }
}

export async function syncLaudusProcurement(organizationId: string, db: SupabaseClient) {
  await markLaudusSyncRunning(db, organizationId, 'procurement');
  let apiCalls = 0;

  try {
    const [orders, invoices, payments] = await Promise.all([
      listRecent('/purchases/orders/list', 'issuedDate', PURCHASE_ORDER_FIELDS, 2),
      listRecent('/purchases/invoices/list', 'issuedDate', PURCHASE_INVOICE_FIELDS, 2),
      listRecent('/purchases/payments/list', 'issuedDate', PURCHASE_PAYMENT_FIELDS, 2),
    ]);

    apiCalls += orders.calls + invoices.calls + payments.calls;

    const orderRows = orders.rows;
    const futureDateIncidents = futureIssuedDateIncidents(orderRows, 'purchase_order');
    const quality = await reconcileFutureIssuedDateIncidents(
      db,
      organizationId,
      'procurement',
      futureDateIncidents,
    );
    const invoiceRows = invoices.rows;
    const flattenedPayments = payments.rows.flatMap(paymentRows).filter((row) => row.paymentId != null);

    const ordersProcessed = await ingestChunks(
      db,
      'motil_ingest_laudus_procurement_documents',
      (chunk) => ({ p_organization_id: organizationId, p_entity_type: 'purchase_order', p_rows: chunk }),
      orderRows,
    );

    const invoicesProcessed = await ingestChunks(
      db,
      'motil_ingest_laudus_procurement_documents',
      (chunk) => ({ p_organization_id: organizationId, p_entity_type: 'purchase_invoice', p_rows: chunk }),
      invoiceRows,
    );

    const paymentsProcessed = await ingestChunks(
      db,
      'motil_ingest_laudus_purchase_payments',
      (chunk) => ({ p_organization_id: organizationId, p_payments: chunk }),
      flattenedPayments,
    );

    const missingInvoiceRecovery = await recoverMissingPurchaseInvoices(organizationId, db);
    apiCalls += Number(missingInvoiceRecovery.apiCalls || 0);

    const refresh = await db.rpc('motil_refresh_laudus_financial_staging', {
      p_organization_id: organizationId,
    });
    if (refresh.error) throw new Error('motil_refresh_laudus_financial_staging failed');

    let legalTraceRecovery: Awaited<ReturnType<typeof syncLegalContractInvoiceTraces>> | null = null;
    let legalTraceRecoveryError: string | null = null;
    try {
      legalTraceRecovery = await syncLegalContractInvoiceTraces(organizationId, db);
      apiCalls += Number(legalTraceRecovery.apiCalls || 0);
    } catch (error) {
      legalTraceRecoveryError = error instanceof Error ? error.message : 'No se pudo recuperar trazabilidad Legal';
      console.error('[laudus/procurement:legal-trace-recovery]', error);
    }

    const partial = orders.partial || invoices.partial || payments.partial;
    const processed = ordersProcessed + invoicesProcessed + paymentsProcessed;

    await markLaudusSyncSuccess(db, organizationId, 'procurement', {
      processed,
      changed: 0,
      apiCalls,
      metadata: {
        partial,
        readOnly: true,
        orders: orderRows.length,
        invoices: invoiceRows.length,
        payments: payments.rows.length,
        paymentAllocations: flattenedPayments.length,
        paymentCoverage: 'verified_v2_list',
        accountsPayableDerived: true,
        legalTraceRecovery,
        legalTraceRecoveryError,
        futureIssuedDateIncidents: futureDateIncidents.length,
        futureIssuedDateQuality: quality,
        recuperacionFacturasFaltantes: missingInvoiceRecovery,
      },
    });

    return {
      organizationId,
      status: partial ? 'partial' : 'completed',
      processed,
      apiCalls,
      partial,
      orders: orderRows.length,
      invoices: invoiceRows.length,
      payments: payments.rows.length,
      paymentAllocations: flattenedPayments.length,
      paymentCoverage: 'verified_v2_list',
      accountsPayableDerived: true,
      futureIssuedDateIncidents: futureDateIncidents.length,
      recuperacionFacturasFaltantes: missingInvoiceRecovery,
    };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'procurement', error, { apiCalls });
    throw error;
  }
}
