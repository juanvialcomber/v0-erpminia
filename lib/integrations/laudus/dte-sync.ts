import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaudus } from '@/lib/integrations/laudus/client';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

type JsonRow = Record<string, unknown>;

function rowsFrom(payload: unknown): JsonRow[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is JsonRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)),
    );
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'rows']) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).filter(
        (row): row is JsonRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)),
      );
    }
  }
  return [];
}

function dedupeDteRows(rows: JsonRow[]) {
  const byDocument = new Map<string, JsonRow>();
  for (const row of rows) {
    const docTypeId = String(row.docTypeId ?? '').trim();
    const docNumber = String(row.docNumber ?? '').trim();
    if (!docTypeId || !docNumber) continue;
    byDocument.set(`${docTypeId}:${docNumber}`, row);
  }
  return [...byDocument.values()];
}

export async function syncLaudusDtePending(
  organizationId: string,
  db: SupabaseClient,
) {
  await markLaudusSyncRunning(db, organizationId, 'dtes');

  let apiCalls = 0;
  try {
    const payload = await getLaudus('/DTE/pending');
    apiCalls += 1;

    const rows = rowsFrom(payload);
    const uniqueRows = dedupeDteRows(rows);
    let changed = 0;

    if (uniqueRows.length > 0) {
      const { data, error } = await db.rpc('motil_ingest_laudus_extended_finance', {
        p_organization_id: organizationId,
        p_accounting_entries: [],
        p_bank_statements: [],
        p_dtes: uniqueRows,
      });
      if (error) throw new Error('Laudus DTE pending staging failed');

      const result = (data || {}) as Record<string, unknown>;
      changed = Number(result.dtes_upserted || uniqueRows.length || 0);
    }

    await markLaudusSyncSuccess(db, organizationId, 'dtes', {
      processed: uniqueRows.length,
      changed,
      apiCalls,
      metadata: {
        endpoint: '/DTE/pending',
        mode: 'pending_snapshot',
        sourceRows: rows.length,
        duplicatesRemoved: Math.max(rows.length - uniqueRows.length, 0),
        readOnly: true,
        historicalComplete: false,
        canonicalMutated: false,
      },
    });

    return {
      organizationId,
      status: 'healthy' as const,
      pending: uniqueRows.length,
      changed,
      apiCalls,
      historicalComplete: false,
    };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'dtes', error, { apiCalls }).catch(() => null);
    throw error;
  }
}
