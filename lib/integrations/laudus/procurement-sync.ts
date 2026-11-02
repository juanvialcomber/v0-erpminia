import type { SupabaseClient } from '@supabase/supabase-js';
import { LaudusApiError, listLaudusWithOrderFallback } from '@/lib/integrations/laudus/client';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

type JsonRow = Record<string, any>;

const ORDER_FIELDS = [
  'purchaseOrderId','issuedDate','dueDate','status','notes','modifiedAt',
  'supplier.supplierId','supplier.name','supplier.legalName','supplier.VATId',
  'warehouse.warehouseId','warehouse.name',
  'items.itemId','items.product.productId','items.product.sku',
  'items.product.description','items.product.unitOfMeasure','items.quantity','items.unitCost',
] as const;

const INVOICE_FIELDS = [
  'purchaseInvoiceId','docNumber','issuedDate','dueDate','modifiedAt',
  'supplier.supplierId','supplier.name','supplier.legalName','supplier.VATId',
  'warehouse.warehouseId','warehouse.name',
  'totals.net','totals.VAT','totals.total','totals.currencyCode',
  'items.itemId','items.product.productId','items.product.sku',
  'items.product.description','items.product.unitOfMeasure','items.quantity','items.unitCost',
] as const;

const PAYMENT_FIELDS = [
  'paymentId','issuedDate','dueDate','document','deposited','notes','modifiedAt',
  'paymentType.code','paymentType.description','bank.bankId','bank.name',
  'purchaseInvoices.itemId','purchaseInvoices.purchaseInvoiceId','purchaseInvoices.docNumber',
  'purchaseInvoices.supplier.supplierId','purchaseInvoices.supplier.name','purchaseInvoices.supplier.legalName',
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

function readField(row: JsonRow, dotted: string) {
  const flat = dotted.replace(/\./g, '_');
  if (row[flat] !== undefined) return row[flat];
  if (row[dotted] !== undefined) return row[dotted];

  let current: any = row;
  for (const key of dotted.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function normalizePurchaseRows(rows: JsonRow[], kind: 'order' | 'invoice') {
  const idField = kind === 'order' ? 'purchaseOrderId' : 'purchaseInvoiceId';
  const grouped = new Map<string, JsonRow>();

  for (const row of rows) {
    const id = readField(row, idField);
    if (id == null) continue;
    const key = String(id);
    let target = grouped.get(key);
    if (!target) {
      const currencyCode = readField(row, 'totals.currencyCode') ?? null;
      target = {
        [idField]: id,
        docNumber: readField(row, 'docNumber') ?? null,
        issuedDate: readField(row, 'issuedDate') ?? null,
        dueDate: readField(row, 'dueDate') ?? null,
        status: readField(row, 'status') ?? null,
        notes: readField(row, 'notes') ?? null,
        modifiedAt: readField(row, 'modifiedAt') ?? null,
        supplier: {
          supplierId: readField(row, 'supplier.supplierId') ?? null,
          name: readField(row, 'supplier.name') ?? null,
          legalName: readField(row, 'supplier.legalName') ?? null,
          VATId: readField(row, 'supplier.VATId') ?? null,
        },
        warehouse: {
          warehouseId: readField(row, 'warehouse.warehouseId') ?? null,
          name: readField(row, 'warehouse.name') ?? null,
        },
        totals: kind === 'invoice' ? {
          net: readField(row, 'totals.net') ?? null,
          tax: readField(row, 'totals.VAT') ?? null,
          total: readField(row, 'totals.total') ?? null,
        } : undefined,
        currency: currencyCode,
        items: [],
      };
      grouped.set(key, target);
    }

    const nestedItems = Array.isArray(row.items) ? row.items : [];
    if (nestedItems.length) {
      for (const item of nestedItems) {
        if (!item || typeof item !== 'object') continue;
        const itemRow = item as JsonRow;
        const product = itemRow.product && typeof itemRow.product === 'object' ? itemRow.product : {};
        (target.items as JsonRow[]).push({
          itemId: itemRow.itemId ?? null,
          product: {
            productId: product.productId ?? null,
            SKU: product.sku ?? product.SKU ?? null,
            description: product.description ?? null,
            unitOfMeasure: product.unitOfMeasure ?? null,
          },
          quantity: itemRow.quantity ?? null,
          unitPrice: itemRow.unitCost ?? itemRow.unitPrice ?? null,
        });
      }
      continue;
    }

    const itemId = readField(row, 'items.itemId');
    const productId = readField(row, 'items.product.productId');
    const sku = readField(row, 'items.product.sku');
    if (itemId != null || productId != null || sku != null) {
      (target.items as JsonRow[]).push({
        itemId: itemId ?? null,
        product: {
          productId: productId ?? null,
          SKU: sku ?? null,
          description: readField(row, 'items.product.description') ?? null,
          unitOfMeasure: readField(row, 'items.product.unitOfMeasure') ?? null,
        },
        quantity: readField(row, 'items.quantity') ?? null,
        unitPrice: readField(row, 'items.unitCost') ?? null,
      });
    }
  }

  return [...grouped.values()];
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
  const base = {
    paymentId: readField(row, 'paymentId') ?? row.id ?? null,
    issuedDate: readField(row, 'issuedDate') ?? null,
    dueDate: readField(row, 'dueDate') ?? null,
    document: readField(row, 'document') ?? null,
    deposited: readField(row, 'deposited') ?? null,
    paymentType_code: readField(row, 'paymentType.code') ?? null,
    paymentType_description: readField(row, 'paymentType.description') ?? null,
    bank_bankId: readField(row, 'bank.bankId') ?? null,
    bank_name: readField(row, 'bank.name') ?? null,
    notes: readField(row, 'notes') ?? null,
  };

  const invoices = Array.isArray(row.purchaseInvoices) ? row.purchaseInvoices : [];
  if (invoices.length) {
    return invoices.map((invoice: JsonRow) => ({
      ...base,
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

  const allocationId = readField(row, 'purchaseInvoices.itemId');
  if (allocationId != null || readField(row, 'purchaseInvoices.purchaseInvoiceId') != null) {
    return [{
      ...base,
      purchaseInvoices_itemId: allocationId ?? readField(row, 'purchaseInvoices.purchaseInvoiceId') ?? null,
      purchaseInvoices_purchaseInvoiceId: readField(row, 'purchaseInvoices.purchaseInvoiceId') ?? null,
      purchaseInvoices_docNumber: readField(row, 'purchaseInvoices.docNumber') ?? null,
      purchaseInvoices_supplier_supplierId: readField(row, 'purchaseInvoices.supplier.supplierId') ?? null,
      purchaseInvoices_supplier_name:
        readField(row, 'purchaseInvoices.supplier.name') ??
        readField(row, 'purchaseInvoices.supplier.legalName') ??
        null,
      purchaseInvoices_originalAmount: readField(row, 'purchaseInvoices.originalAmount') ?? null,
      purchaseInvoices_currencyCode: readField(row, 'purchaseInvoices.currencyCode') ?? null,
      purchaseInvoices_parityToMainCurrency: readField(row, 'purchaseInvoices.parityToMainCurrency') ?? null,
      purchaseInvoices_amount: readField(row, 'purchaseInvoices.amount') ?? null,
      purchaseInvoices_costCenter_costCenterId: readField(row, 'purchaseInvoices.costCenter.costCenterId') ?? null,
    }];
  }

  return [base];
}

async function listRecent(path: string, fields: readonly string[], orderField: string, maxPages = 2) {
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
    const listed = await listLaudusWithOrderFallback('/purchases/suppliers/list', {
      options: { offset: page * 100, limit: 100 },
      orderBy: [{ field: 'supplierId', direction: 'DESC' }],
    });
    calls += listed.apiCalls;
    const pageRows = rowsFrom(listed.payload);
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
    const [orders, invoices, payments] = await Promise.all([
      listRecent('/purchases/orders/list', ORDER_FIELDS, 'modifiedAt', 2),
      listRecent('/purchases/invoices/list', INVOICE_FIELDS, 'modifiedAt', 2),
      listRecent('/purchases/payments/list', PAYMENT_FIELDS, 'modifiedAt', 2),
    ]);

    apiCalls += orders.calls + invoices.calls + payments.calls;

    const orderRows = normalizePurchaseRows(orders.rows, 'order');
    const invoiceRows = normalizePurchaseRows(invoices.rows, 'invoice');
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
    await markLaudusSyncFailure(db, organizationId, 'procurement', error, {
      apiCalls,
      metadata: error instanceof LaudusApiError
        ? { path: error.path, status: error.status, upstreamCode: error.upstreamCode, readOnly: true }
        : { readOnly: true },
    });
    throw error;
  }
}
