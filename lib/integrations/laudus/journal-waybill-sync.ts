import type { SupabaseClient } from '@supabase/supabase-js';
import { listLaudus } from '@/lib/integrations/laudus/client';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

type JsonRow = Record<string, any>;

function rowsFrom(payload: unknown): JsonRow[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is JsonRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'rows']) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).filter((row): row is JsonRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    }
  }
  return [];
}

async function listRecent(path: string, orderField: string, maxPages = 2) {
  const rows: JsonRow[] = [];
  let apiCalls = 0;
  let partial = false;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await listLaudus(path, {
      options: { offset: page * 100, limit: 100 },
      orderBy: [{ field: orderField, direction: 'DESC' }],
    });
    apiCalls += 1;
    const pageRows = rowsFrom(payload);
    rows.push(...pageRows);
    if (pageRows.length < 100) return { rows, apiCalls, partial: false };
    if (page === maxPages - 1) partial = true;
  }

  return { rows, apiCalls, partial };
}

function flattenWaybill(row: JsonRow): JsonRow[] {
  const supplier = row.supplier && typeof row.supplier === 'object' ? row.supplier : {};
  const warehouse = row.warehouse && typeof row.warehouse === 'object' ? row.warehouse : {};
  const items = Array.isArray(row.items) ? row.items : [];

  const base = {
    purchaseWaybillId: row.purchaseWaybillId ?? row.id ?? null,
    docNumber: row.docNumber ?? null,
    issuedDate: row.issuedDate ?? null,
    supplier_supplierId: supplier.supplierId ?? row.supplierId ?? null,
    supplier_name: supplier.name ?? row.supplierName ?? null,
    supplier_legalName: supplier.legalName ?? row.supplierLegalName ?? null,
    supplier_VATId: supplier.VATId ?? supplier.vatId ?? row.supplierVATId ?? null,
    warehouse_warehouseId: warehouse.warehouseId ?? row.warehouseId ?? null,
    warehouse_name: warehouse.name ?? row.warehouseName ?? null,
  };

  if (items.length === 0) return [base];

  return items.map((item: JsonRow) => {
    const product = item.product && typeof item.product === 'object' ? item.product : {};
    return {
      ...base,
      items_itemId: item.itemId ?? null,
      items_product_productId: product.productId ?? item.productId ?? null,
      items_product_sku: product.sku ?? item.sku ?? null,
      items_product_description: product.description ?? item.description ?? null,
      items_product_unitOfMeasure: product.unitOfMeasure ?? item.unitOfMeasure ?? null,
      items_quantity: item.quantity ?? null,
    };
  });
}

export async function syncLaudusAccountingEntries(organizationId: string, db: SupabaseClient) {
  await markLaudusSyncRunning(db, organizationId, 'accounting_entries');
  let apiCalls = 0;
  try {
    const listed = await listRecent('/accounting/journal/entries/list', 'modifiedAt', 2);
    apiCalls += listed.apiCalls;

    const { data, error } = await db.rpc('motil_ingest_laudus_extended_finance', {
      p_organization_id: organizationId,
      p_accounting_entries: listed.rows,
      p_bank_statements: [],
      p_dtes: [],
    });
    if (error) throw new Error('Laudus accounting entry staging failed');

    const result = (data || {}) as Record<string, unknown>;
    const processed = Number(result.accounting_entries_upserted || listed.rows.length || 0);
    await markLaudusSyncSuccess(db, organizationId, 'accounting_entries', {
      processed,
      changed: 0,
      conflicts: 0,
      apiCalls,
      metadata: { partial: listed.partial, readOnly: true, latestLimit: 200, canonicalMutated: false },
    });
    return { organizationId, status: listed.partial ? 'partial' : 'completed', processed, apiCalls, partial: listed.partial };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'accounting_entries', error, { apiCalls });
    throw error;
  }
}

export async function syncLaudusPurchaseWaybills(organizationId: string, db: SupabaseClient) {
  await markLaudusSyncRunning(db, organizationId, 'waybills');
  let apiCalls = 0;
  try {
    const listed = await listRecent('/purchases/waybills/list', 'issuedDate', 2);
    apiCalls += listed.apiCalls;
    const flattened = listed.rows.flatMap(flattenWaybill).filter((row) => row.purchaseWaybillId != null);

    let processed = 0;
    let lines = 0;
    for (let i = 0; i < flattened.length; i += 500) {
      const chunk = flattened.slice(i, i + 500);
      const { data, error } = await db.rpc('motil_ingest_laudus_waybill_rows', {
        p_organization_id: organizationId,
        p_rows: chunk,
      });
      if (error) throw new Error('Laudus waybill staging failed');
      const result = (data || {}) as Record<string, unknown>;
      processed += Number(result.rows || chunk.length || 0);
      lines += Number(result.lines || 0);
    }

    await markLaudusSyncSuccess(db, organizationId, 'waybills', {
      processed,
      changed: 0,
      conflicts: 0,
      apiCalls,
      metadata: {
        partial: listed.partial,
        readOnly: true,
        documents: listed.rows.length,
        flattenedRows: flattened.length,
        lines,
        canonicalMutated: false,
      },
    });
    return { organizationId, status: listed.partial ? 'partial' : 'completed', processed, lines, apiCalls, partial: listed.partial };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'waybills', error, { apiCalls });
    throw error;
  }
}
