import type { SupabaseClient } from '@supabase/supabase-js';
import { listLaudus } from '@/lib/integrations/laudus/client';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

type JsonRow = Record<string, any>;

const SUPPLIER_FIELDS = ['supplierId','name','legalName','VATId','email','phone','city'] as const;
const PURCHASE_ORDER_FIELDS = ['purchaseOrderId','issuedDate','supplier.name','status','items.product.sku','items.quantity'] as const;
const PURCHASE_INVOICE_FIELDS = ['purchaseInvoiceId','docNumber','issuedDate','dueDate','supplier.name','totals.total'] as const;

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

async function listRecent(path: string, orderField: string, fields: readonly string[], maxPages = 2) {
  const rows: JsonRow[] = [];
  let calls = 0;
  let partial = false;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await listLaudus(path, {
      options: { offset: page * 100, limit: 100 },
      fields: [...fields],
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
      fields: [...SUPPLIER_FIELDS],
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
    const [orders, invoices] = await Promise.all([
      listRecent('/purchases/orders/list', 'issuedDate', PURCHASE_ORDER_FIELDS, 2),
      listRecent('/purchases/invoices/list', 'issuedDate', PURCHASE_INVOICE_FIELDS, 2),
    ]);

    apiCalls += orders.calls + invoices.calls;

    const orderRows = orders.rows;
    const invoiceRows = invoices.rows;
    // The current public Laudus API catalogue does not expose a verified
    // purchase-payments list endpoint. Do not probe guessed endpoints: it
    // wastes the monthly call budget and can overstate accounts payable.

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

    const paymentsProcessed = 0;

    const refresh = await db.rpc('motil_refresh_laudus_financial_staging', {
      p_organization_id: organizationId,
    });
    if (refresh.error) throw new Error('motil_refresh_laudus_financial_staging failed');

    const partial = orders.partial || invoices.partial;
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
        payments: 0,
        paymentAllocations: 0,
        paymentCoverage: 'not_verified',
        accountsPayableDerived: false,
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
      payments: 0,
      paymentAllocations: 0,
      paymentCoverage: 'not_verified',
      accountsPayableDerived: false,
    };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'procurement', error, { apiCalls });
    throw error;
  }
}
