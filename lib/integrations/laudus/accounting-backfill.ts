import type { SupabaseClient } from '@supabase/supabase-js';
import { listLaudus } from '@/lib/integrations/laudus/client';

type JsonRow = Record<string, any>;

const JOURNAL_FIELDS = [
  'journalEntryId','journalEntryNumber','date','type','approved',
  'lines.lineId','lines.account.accountNumber','lines.account.name',
  'lines.description','lines.debit','lines.credit','lines.currencyCode',
  'lines.costCenter.costCenterId','lines.document',
] as const;

const PAGE_SIZE = 100;
const WINDOW_DAYS = 31;

function rowsFrom(payload: unknown): JsonRow[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is JsonRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
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

function normalizeNumberish(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeAndDedupe(rows: JsonRow[]) {
  const byId = new Map<string, JsonRow>();
  for (const row of rows) {
    const id = String(row.journalEntryId ?? row.id ?? '').trim();
    if (!id) continue;
    const lines = Array.isArray(row.lines)
      ? row.lines.map((line: JsonRow) => ({
          ...line,
          debit: normalizeNumberish(line?.debit),
          credit: normalizeNumberish(line?.credit),
        }))
      : [];
    byId.set(id, { ...row, lines });
  }
  return [...byId.values()];
}

function isoDay(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value + 'T00:00:00.000Z');
  return date.toISOString().slice(0, 10);
}

function addDays(day: string, days: number) {
  const date = new Date(day + 'T00:00:00.000Z');
  date.setUTCDate(date.getUTCDate() + days);
  return isoDay(date);
}

function minDay(a: string, b: string) {
  return a <= b ? a : b;
}

async function checkpoint(
  db: SupabaseClient,
  args: {
    organizationId: string;
    leaseToken: string;
    windowFrom: string;
    windowTo: string;
    nextDateFrom: string;
    nextOffset: number;
    status: 'pending' | 'running' | 'completed' | 'failed';
    rowsRead?: number;
    rowsStaged?: number;
    duplicatesRemoved?: number;
    apiCalls?: number;
    error?: string | null;
  },
) {
  const { data, error } = await db.rpc('motil_checkpoint_laudus_accounting_backfill_v2', {
    p_organization_id: args.organizationId,
    p_lease_token: args.leaseToken,
    p_window_from: args.windowFrom,
    p_window_to: args.windowTo,
    p_next_date_from: args.nextDateFrom,
    p_next_offset: args.nextOffset,
    p_status: args.status,
    p_rows_read: args.rowsRead || 0,
    p_rows_staged: args.rowsStaged || 0,
    p_duplicates_removed: args.duplicatesRemoved || 0,
    p_api_calls: args.apiCalls || 0,
    p_error: args.error || null,
  });
  if (error) throw new Error('Laudus accounting backfill checkpoint failed');
  return data as Record<string, unknown>;
}

export async function runLaudusAccountingBackfill(
  organizationId: string,
  db: SupabaseClient,
  maxCalls = 30,
) {
  const boundedMaxCalls = Math.min(Math.max(Math.trunc(maxCalls), 1), 30);
  const { data: leaseData, error: leaseError } = await db.rpc(
    'motil_acquire_laudus_accounting_backfill_lease',
    { p_organization_id: organizationId, p_lease_minutes: 30 },
  );
  if (leaseError || !leaseData) throw new Error('Laudus accounting backfill lease unavailable');

  const lease = leaseData as Record<string, any>;
  if (!lease.acquired) {
    return {
      organizationId,
      status: 'skipped_locked' as const,
      apiCalls: 0,
      rowsRead: 0,
      rowsStaged: 0,
    };
  }

  const leaseToken = String(lease.lease_token || '');
  const state = (lease.state || {}) as Record<string, any>;
  if (!leaseToken || !state.next_date_from) {
    throw new Error('Laudus accounting backfill lease state invalid');
  }

  let windowFrom = isoDay(String(state.next_date_from));
  const targetDate = isoDay(String(state.target_date));
  let windowTo = minDay(addDays(windowFrom, WINDOW_DAYS - 1), targetDate);
  let offset = Math.max(Number(state.next_offset || 0), 0);

  let apiCalls = 0;
  let rowsRead = 0;
  let rowsStaged = 0;
  let duplicatesRemoved = 0;

  while (apiCalls < boundedMaxCalls) {
    try {
      const payload = await listLaudus('/accounting/journal/entries/list', {
        options: { offset, limit: PAGE_SIZE },
        fields: [...JOURNAL_FIELDS],
        filterBy: [
          { field: 'date', operator: '>=', value: windowFrom + 'T00:00:00' },
          { field: 'date', operator: '<=', value: windowTo + 'T23:59:59.999' },
        ],
        orderBy: [
          { field: 'date', direction: 'ASC' },
          { field: 'journalEntryId', direction: 'ASC' },
        ],
      });
      apiCalls += 1;

      const pageRows = rowsFrom(payload);
      const uniqueRows = normalizeAndDedupe(pageRows);
      const pageDuplicates = Math.max(pageRows.length - uniqueRows.length, 0);

      if (uniqueRows.length > 0) {
        const { error: ingestError } = await db.rpc('motil_ingest_laudus_extended_finance', {
          p_organization_id: organizationId,
          p_accounting_entries: uniqueRows,
          p_bank_statements: [],
          p_dtes: [],
        });
        if (ingestError) throw new Error('Laudus accounting backfill staging failed');
      }

      rowsRead += pageRows.length;
      rowsStaged += uniqueRows.length;
      duplicatesRemoved += pageDuplicates;

      const pageComplete = pageRows.length < PAGE_SIZE;
      let nextDateFrom = windowFrom;
      let nextOffset = offset + PAGE_SIZE;
      let status: 'pending' | 'completed' = 'pending';

      if (pageComplete) {
        nextDateFrom = addDays(windowTo, 1);
        nextOffset = 0;
        if (nextDateFrom > targetDate) status = 'completed';
      }

      await checkpoint(db, {
        organizationId,
        leaseToken,
        windowFrom,
        windowTo,
        nextDateFrom,
        nextOffset,
        status,
        rowsRead: pageRows.length,
        rowsStaged: uniqueRows.length,
        duplicatesRemoved: pageDuplicates,
        apiCalls: 1,
      });

      if (status === 'completed') {
        return { organizationId, status, apiCalls, rowsRead, rowsStaged, duplicatesRemoved, nextDateFrom };
      }

      if (pageComplete) {
        windowFrom = nextDateFrom;
        windowTo = minDay(addDays(windowFrom, WINDOW_DAYS - 1), targetDate);
        offset = 0;
      } else {
        offset = nextOffset;
      }
    } catch (error) {
      await checkpoint(db, {
        organizationId,
        leaseToken,
        windowFrom,
        windowTo,
        nextDateFrom: windowFrom,
        nextOffset: offset,
        status: 'failed',
        error: error instanceof Error ? error.message : 'unknown',
      }).catch(() => null);
      throw error;
    }
  }

  try {
    return {
      organizationId,
      status: 'pending' as const,
      apiCalls,
      rowsRead,
      rowsStaged,
      duplicatesRemoved,
      nextDateFrom: windowFrom,
      nextOffset: offset,
      targetDate,
    };
  } finally {
    await db.rpc('motil_release_laudus_accounting_backfill_lease', {
      p_organization_id: organizationId,
      p_lease_token: leaseToken,
    }).catch(() => null);
  }
}
