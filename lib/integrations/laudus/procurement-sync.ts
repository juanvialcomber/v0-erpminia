import { listLaudus } from '@/lib/integrations/laudus/client';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

type SupabaseLike = {
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

type JsonRow = Record<string, any>;

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
  if (invoices.length === 0) {
    return [{
      paymentId: row.paymentId ?? row.id ?? null,
      issuedDate: row.issuedDate ?? null,
      dueDate: row.dueDate ?? null,
      document: row.document ?? null,
      deposited: row.deposited ?? null,
      paymentType_code: row.paymentType?.code ?? row.paymentType_code ?? null,
      paymentType_description: row.paymentType?.description ?? row.paymentType_description ?? null,
      bank_bankId: row.bank?.bankId ?? row.bank_bankId ?? null,
      bank_name: row.bank?.name ?? row.bank_name ?? null,
      notes: row.notes ?? null,
    }];
  }

  return invoices.map((invoice: JsonRow) => ({
    paymentId: row.paymentId ?? row.id ?? null,
    issuedDate: row.issuedDate ?? null,
    dueDate: row.dueDate ?? null,
    document: row.document ?? null,
    deposited: row.deposited ?? null,
    paymentType_code: row.paymentType?.code ?? row.paymentType_code ?? null,
    paymentType_description: row.paymentType?.description ?? row.paymentType_description ?? null,
    bank_bankId: row.bank?.bankId ?? row.bank_bankId ?? null,
    bank_name: row.bank?.name ?? row.bank_name ?? null,
    notes: row.notes ?? null,
    purchaseInvoices_itemId: invoice.itemId ?? invoice.purchaseInvoiceId ?? null,
    purchaseInvoices_purchaseInvoiceId: invoice.purchaseInvoiceId ?? null,
    purchaseInvoices_docNumber: invoice.docNumber ?? null,
    purchaseInvoices_supplier_supplierId: invoice.supplier?.supplierId ?? invoice.supplierId ?? null,
    purchaseInvoices_supplier_name: invoice.supplier?.name ?? invoice.supplier?.legalName ?? invoice.supplierName ?? null,
    purchaseInvoices_originalAmount: invoice.originalAmount ?? null,
    purchaseInvoices_currencyCode: invoice.currencyCode ?? null,
    purchaseInvoices_parityToMainCurrency: invoice.parityToMainCurrency ?? null,
    purchaseInvoices_amount: invoice.amount ?? null,
    purchaseInvoices_costCenter_costCenterId: invoice.costCenter?.costCenterId ?? invoice.costCenterId ?? null,
  }));
}

async function listRecent(path: string, orderField: string, maxPages = 2) {
  const rows: JsonRow[] = [];
  let calls = 0;
  let partial = false;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await listLaudus(path, {
      options: { offset: page * 100, limit: 100 },
      orderBy: [{ field: orderField, direction: 'DESC' }],
    });
    calls += 1;
    const pageRows = rowsFrom(payload);
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
      orderBy: [{ field: 'supplierId', direction: 'DESC' }],
    });
    calls += 1;
    const pageRows = rowsFrom(payload);
    rows.push(...pageRows);

    if (pageRows.length < 100) return { rows, calls, partial: false };
    if (page === 24) partial = true;
  }

  return { rows, calls, partial };
}

async function ingestChunks(
  db: SupabaseLike,
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

export async function syncLaudusSuppliers(organizationId: string, db: SupabaseLike) {
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

export async function syncLaudusProcurement(organizationId: string, db: SupabaseLike) {
  await markLaudusSyncRunning(db, organizationId, 'procurement');
  let apiCalls = 0;

  try {
    const [orders, invoices, payments] = await Promise.all([
      listRecent('/purchases/orders/list', 'issuedDate', 2),
      listRecent('/purchases/invoices/list', 'issuedDate', 2),
      listRecent('/purchases/payments/list', 'issuedDate', 2),
    ]);

    apiCalls += orders.calls + invoices.calls + payments.calls;

    const orderRows = orders.rows;
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

    const refresh = await db.rpc('motil_refresh_laudus_financial_staging', {
      p_organization_id: organizationId,
    });
    if (refresh.error) throw new Error('motil_refresh_laudus_financial_staging failed');

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
        accountsPayableDerived: true,
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
      accountsPayableDerived: true,
    };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'procurement', error, { apiCalls });
    throw error;
  }
}
