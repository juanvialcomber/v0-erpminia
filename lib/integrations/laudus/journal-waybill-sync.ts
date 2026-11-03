import type { SupabaseClient } from '@supabase/supabase-js';
import { listLaudus } from '@/lib/integrations/laudus/client';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

type JsonRow = Record<string, any>;

const JOURNAL_FIELDS = ['journalEntryId','journalEntryNumber','date','lines.account.accountNumber','lines.debit','lines.credit'] as const;

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
    const payload = await listLaudus(path, {
      options: { offset: page * 100, limit: 100 },
      fields: [...fields],
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

export async function syncLaudusAccountingEntries(organizationId: string, db: SupabaseClient) {
  await markLaudusSyncRunning(db, organizationId, 'accounting_entries');
  let apiCalls = 0;
  try {
    const listed = await listRecent('/accounting/journal/entries/list', 'date', JOURNAL_FIELDS, 2);
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

export async function syncLaudusPurchaseWaybills(organizationId: string, _db: SupabaseClient) {
  return {
    organizationId,
    status: 'unsupported' as const,
    processed: 0,
    lines: 0,
    apiCalls: 0,
    partial: false,
    reason: 'Laudus waybill list endpoint is not verified in the current public API catalogue.',
  };
}
