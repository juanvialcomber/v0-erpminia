import type { SupabaseClient } from '@supabase/supabase-js';
import { listLaudus } from '@/lib/integrations/laudus/client';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

const BANK_STATEMENT_PATH = '/accounting/bankStatements/list';
const BANK_STATEMENT_FIELDS = ['bankStatementId', 'dateFrom', 'dateTo', 'initialBalance'] as const;

function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  const rows =
    Array.isArray(payload) ? payload :
    payload && typeof payload === 'object'
      ? (['data', 'items', 'results', 'rows']
          .map((key) => (payload as Record<string, unknown>)[key])
          .find(Array.isArray) as unknown[] | undefined) || []
      : [];

  return rows.filter((row): row is Record<string, unknown> =>
    Boolean(row && typeof row === 'object' && !Array.isArray(row)));
}

export async function syncLaudusBankStatements(
  organizationId: string,
  db: SupabaseClient,
) {
  await markLaudusSyncRunning(db, organizationId, 'bank_statements');
  let apiCalls = 0;

  try {
    const payload = await listLaudus(BANK_STATEMENT_PATH, {
      options: { offset: 0, limit: 25 },
      fields: [...BANK_STATEMENT_FIELDS],
      orderBy: [{ field: 'dateTo', direction: 'DESC' }],
    });
    apiCalls += 1;

    const rows = rowsFromPayload(payload);
    const { data, error } = await db.rpc('motil_ingest_laudus_extended_finance', {
      p_organization_id: organizationId,
      p_accounting_entries: [],
      p_bank_statements: rows,
      p_dtes: [],
    });

    if (error) throw new Error('Laudus bank statement staging failed');

    const result = (data || {}) as Record<string, unknown>;
    const processed = Number(result.bank_statements_upserted || rows.length || 0);

    await markLaudusSyncSuccess(db, organizationId, 'bank_statements', {
      processed,
      changed: 0,
      conflicts: 0,
      apiCalls,
      metadata: {
        readOnly: true,
        recentLimit: 25,
        canonicalMutated: false,
      },
    });

    return {
      organizationId,
      status: 'completed' as const,
      processed,
      apiCalls,
      canonicalMutated: false,
      laudusMutated: false,
    };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'bank_statements', error, {
      apiCalls,
      metadata: { readOnly: true, recentLimit: 25 },
    });
    throw error;
  }
}
