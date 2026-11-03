import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaudus, LaudusApiError } from '@/lib/integrations/laudus/client';

function rowsFrom(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> =>
      Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'rows']) {
    const rows = record[key];
    if (Array.isArray(rows)) {
      return rows.filter((row): row is Record<string, unknown> =>
        Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    }
  }
  return [];
}

export async function syncLaudusPendingDtes(organizationId: string, db: SupabaseClient) {
  let apiCalls = 0;
  try {
    apiCalls += 1;
    const payload = await getLaudus('/DTE/pending');
    const rows = rowsFrom(payload);
    if (rows.length > 1000) {
      throw new Error(`Laudus DTE pending exceeds safe staging limit: ${rows.length} documents`);
    }

    const { data, error } = await db.rpc('motil_ingest_laudus_extended_finance', {
      p_organization_id: organizationId,
      p_accounting_entries: [],
      p_bank_statements: [],
      p_dtes: rows,
    });
    if (error) throw new Error('Laudus DTE staging failed');

    const result = (data || {}) as Record<string, unknown>;
    return {
      organizationId,
      status: 'completed' as const,
      processed: Number(result.dtes_upserted || rows.length || 0),
      apiCalls,
      pendingDocuments: rows.length,
      stagingOnly: true,
      canonicalMutated: false,
      laudusMutated: false,
    };
  } catch (error) {
    const upstream = error instanceof LaudusApiError
      ? { path: error.path, status: error.status, upstreamCode: error.upstreamCode }
      : null;
    const wrapped = new Error(error instanceof Error ? error.message : 'Laudus DTE sync failed') as Error & {
      upstream?: typeof upstream;
      apiCalls?: number;
    };
    wrapped.upstream = upstream;
    wrapped.apiCalls = apiCalls;
    throw wrapped;
  }
}
