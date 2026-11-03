import type { SupabaseClient } from '@supabase/supabase-js';
import { listLaudus } from '@/lib/integrations/laudus/client';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

const BANK_STATEMENT_PATH = '/accounting/bankStatements/list';
const BANK_STATEMENT_FIELDS = ['bankStatementId','number','year','dateFrom','dateTo','initialBalance','modifiedAt','bank.bankId','bank.name','bank.account','bank.currencyCode'] as const;

function readField(row: Record<string, unknown>, dotted: string) {
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

function normalizeStatement(row: Record<string, unknown>) {
  return {
    ...row,
    bankStatementId: readField(row, 'bankStatementId') ?? null,
    number: readField(row, 'number') ?? null,
    year: readField(row, 'year') ?? null,
    dateFrom: readField(row, 'dateFrom') ?? null,
    dateTo: readField(row, 'dateTo') ?? null,
    initialBalance: readField(row, 'initialBalance') ?? null,
    modifiedAt: readField(row, 'modifiedAt') ?? null,
    bank: {
      bankId: readField(row, 'bank.bankId') ?? null,
      name: readField(row, 'bank.name') ?? null,
      account: readField(row, 'bank.account') ?? null,
      currencyCode: readField(row, 'bank.currencyCode') ?? null,
    },
  };
}

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

    const rows = rowsFromPayload(payload).map(normalizeStatement);
    const latestStatementDate = rows.reduce<string | null>((latest, row) => {
      const candidate =
        typeof row.dateTo === 'string'
          ? row.dateTo
          : typeof row.dateFrom === 'string'
            ? row.dateFrom
            : null;
      if (!candidate) return latest;
      if (!latest) return candidate;
      const candidateTime = Date.parse(candidate);
      const latestTime = Date.parse(latest);
      if (!Number.isFinite(candidateTime)) return latest;
      if (!Number.isFinite(latestTime)) return candidate;
      return candidateTime > latestTime ? candidate : latest;
    }, null);

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
        latestStatementDate,
        canonicalMutated: false,
      },
    });

    return {
      organizationId,
      status: 'completed' as const,
      processed,
      apiCalls,
      latestStatementDate,
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
