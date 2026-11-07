import type { SupabaseClient } from '@supabase/supabase-js';
import { listLaudusWithOrderFallback } from '@/lib/integrations/laudus/client';
import { futureIssuedDateIncidents, reconcileFutureIssuedDateIncidents } from '@/lib/integrations/laudus/data-quality';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

type JsonRow = Record<string, any>;

const JOURNAL_FIELDS = [
  'journalEntryId','journalEntryNumber','date','type','approved',
  'lines.lineId','lines.account.accountNumber','lines.account.name',
  'lines.description','lines.debit','lines.credit','lines.currencyCode',
  'lines.costCenter.costCenterId','lines.document',
] as const;
const PURCHASE_WAYBILL_FIELDS = [
  'purchaseWaybillId','docNumber','description','issuedDate',
  'supplier.supplierId','supplier.name','supplier.legalName','supplier.VATId',
  'warehouse.warehouseId','warehouse.name',
  'items.itemId','items.product.productId','items.product.sku',
  'items.product.description','items.product.unitOfMeasure',
  'items.itemDescription','items.quantity','items.originalUnitCost',
  'items.currencyCode','items.parityToMainCurrency','items.unitCost',
  'items.costCenter.costCenterId',
] as const;

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

async function listRecent(path: string, orderField: string, fields: readonly string[], maxPages = 2) {
  const rows: JsonRow[] = [];
  let apiCalls = 0;
  let partial = false;

  for (let page = 0; page < maxPages; page += 1) {
    const listed = await listLaudusWithOrderFallback(path, {
      options: { offset: page * 100, limit: 100 },
      fields: [...fields],
      orderBy: [{ field: orderField, direction: 'DESC' }],
    });
    apiCalls += listed.apiCalls;
    const pageRows = rowsFrom(listed.payload);
    rows.push(...pageRows);
    if (pageRows.length < 100) return { rows, apiCalls, partial: false };
    if (page === maxPages - 1) partial = true;
  }

  return { rows, apiCalls, partial };
}

function normalizeNumberish(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeJournalRows(rows: JsonRow[]) {
  const byId = new Map<string, JsonRow>();

  for (const row of rows) {
    const id = String(row.journalEntryId ?? row.id ?? '').trim();
    if (!id) continue;

    const current = byId.get(id) || { ...row, lines: [] };
    const existingLines = Array.isArray(current.lines) ? current.lines as JsonRow[] : [];
    const lineMap = new Map<string, JsonRow>();

    const lineKey = (line: JsonRow) => String(line?.lineId ?? [
      line?.account?.accountNumber ?? line?.accountNumber ?? '',
      line?.description ?? '',
      line?.debit ?? '',
      line?.credit ?? '',
      line?.document ?? '',
    ].join('|'));

    for (const line of existingLines) lineMap.set(lineKey(line), line);

    if (Array.isArray(row.lines)) {
      for (const line of row.lines as JsonRow[]) {
        const normalizedLine = {
          ...line,
          debit: normalizeNumberish(line?.debit),
          credit: normalizeNumberish(line?.credit),
        };
        lineMap.set(lineKey(normalizedLine), normalizedLine);
      }
    }

    const flatLineId = row.lines_lineId ?? row['lines.lineId'];
    const flatAccountNumber = row.lines_account_accountNumber ?? row['lines.account.accountNumber'];
    const flatAccountName = row.lines_account_name ?? row['lines.account.name'];
    const flatDescription = row.lines_description ?? row['lines.description'];
    const flatDebit = row.lines_debit ?? row['lines.debit'];
    const flatCredit = row.lines_credit ?? row['lines.credit'];
    const flatCurrency = row.lines_currencyCode ?? row['lines.currencyCode'];
    const flatCostCenter = row.lines_costCenter_costCenterId ?? row['lines.costCenter.costCenterId'];
    const flatDocument = row.lines_document ?? row['lines.document'];

    if (
      flatLineId != null
      || flatAccountNumber != null
      || flatDescription != null
      || flatDebit != null
      || flatCredit != null
    ) {
      const normalizedFlatLine: JsonRow = {
        lineId: flatLineId ?? null,
        account: {
          accountNumber: flatAccountNumber ?? null,
          name: flatAccountName ?? null,
        },
        description: flatDescription ?? null,
        debit: normalizeNumberish(flatDebit),
        credit: normalizeNumberish(flatCredit),
        currencyCode: flatCurrency ?? null,
        costCenter: flatCostCenter != null ? { costCenterId: flatCostCenter } : null,
        document: flatDocument ?? null,
      };
      lineMap.set(lineKey(normalizedFlatLine), normalizedFlatLine);
    }

    byId.set(id, {
      ...current,
      ...row,
      lines: [...lineMap.values()],
    });
  }

  return [...byId.values()];
}

function flattenWaybill(row: JsonRow): JsonRow[] {
  const supplier = row.supplier && typeof row.supplier === 'object' ? row.supplier : {};
  const warehouse = row.warehouse && typeof row.warehouse === 'object' ? row.warehouse : {};
  const items = Array.isArray(row.items) ? row.items : [];

  const base = {
    purchaseWaybillId: row.purchaseWaybillId ?? row.id ?? null,
    docNumber: row.docNumber ?? null,
    description: row.description ?? null,
    issuedDate: row.issuedDate ?? null,
    supplier_supplierId: supplier.supplierId ?? null,
    supplier_name: supplier.name ?? null,
    supplier_legalName: supplier.legalName ?? null,
    supplier_VATId: supplier.VATId ?? null,
    warehouse_warehouseId: warehouse.warehouseId ?? null,
    warehouse_name: warehouse.name ?? null,
  };

  if (items.length === 0) return [base];

  return items.map((item: JsonRow) => {
    const product = item.product && typeof item.product === 'object' ? item.product : {};
    return {
      ...base,
      items_itemId: item.itemId ?? null,
      items_product_productId: product.productId ?? null,
      items_product_sku: product.sku ?? null,
      items_product_description: product.description ?? null,
      items_product_unitOfMeasure: product.unitOfMeasure ?? null,
      items_itemDescription: item.itemDescription ?? null,
      items_quantity: item.quantity ?? null,
      items_originalUnitCost: item.originalUnitCost ?? null,
      items_currencyCode: item.currencyCode ?? null,
      items_parityToMainCurrency: item.parityToMainCurrency ?? null,
      items_unitCost: item.unitCost ?? null,
      items_costCenter_costCenterId: item.costCenter?.costCenterId ?? null,
    };
  });
}

export async function syncLaudusAccountingEntries(organizationId: string, db: SupabaseClient) {
  await markLaudusSyncRunning(db, organizationId, 'accounting_entries');
  let apiCalls = 0;
  try {
    const listed = await listRecent('/accounting/journal/entries/list', 'date', JOURNAL_FIELDS, 2);
    apiCalls += listed.apiCalls;

    const { data, error } = await db.rpc('motil_ingest_laudus_extended_finance', {
      p_organization_id: organizationId,
      p_accounting_entries: normalizeJournalRows(listed.rows),
      p_bank_statements: [],
      p_dtes: [],
    });
    if (error) throw new Error('Laudus accounting entry staging failed');

    const result = (data || {}) as Record<string, unknown>;
    const uniqueRows = normalizeJournalRows(listed.rows);
    const processed = Number(result.accounting_entries_upserted || uniqueRows.length || 0);
    await markLaudusSyncSuccess(db, organizationId, 'accounting_entries', {
      processed,
      changed: 0,
      conflicts: 0,
      apiCalls,
      metadata: {
        partial: listed.partial,
        readOnly: true,
        latestLimit: 200,
        rowsRead: listed.rows.length,
        uniqueEntries: uniqueRows.length,
        flattenedLineRowsGrouped: Math.max(listed.rows.length - uniqueRows.length, 0),
        duplicatesRemoved: 0,
        canonicalMutated: false,
      },
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
    const listed = await listRecent(
      '/purchases/waybills/list',
      'issuedDate',
      PURCHASE_WAYBILL_FIELDS,
      2,
    );
    apiCalls += listed.apiCalls;

    const futureDateIncidents = futureIssuedDateIncidents(listed.rows, 'waybill');
    const quality = await reconcileFutureIssuedDateIncidents(
      db,
      organizationId,
      'waybills',
      futureDateIncidents,
    );

    const flattened = listed.rows
      .flatMap(flattenWaybill)
      .filter((row) => row.purchaseWaybillId != null);

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
        contract: 'swagger_v2',
        canonicalMutated: false,
        futureIssuedDateIncidents: futureDateIncidents.length,
        futureIssuedDateQuality: quality,
      },
    });

    return {
      organizationId,
      status: listed.partial ? 'partial' : 'completed',
      processed,
      lines,
      apiCalls,
      partial: listed.partial,
      contract: 'swagger_v2' as const,
      futureIssuedDateIncidents: futureDateIncidents.length,
    };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'waybills', error, { apiCalls });
    throw error;
  }
}
