import { getLaudus, LaudusApiError, listLaudus } from './client';
import { extractLaudusListRows } from './financial-masters';

export const LAUDUS_JOURNAL_ENTRY_FIELDS = [
  'journalEntryId',
  'journalEntryNumber',
  'date',
  'type',
  'typeNumber',
  'approved',
  'generated',
  'generatedBy',
  'bookId',
  'notes',
  'createdAt',
  'modifiedAt',
] as const;

export const LAUDUS_BANK_STATEMENT_FIELDS = [
  'bankStatementId',
  'number',
  'year',
  'bank.bankId',
  'bank.name',
  'dateFrom',
  'dateTo',
  'initialBalance',
  'createdAt',
  'modifiedAt',
] as const;

type DomainError = {
  domain: 'journal_entries' | 'bank_statements' | 'dte_pending';
  status: number | null;
};

function safeStatus(error: unknown) {
  return error instanceof LaudusApiError ? error.status : null;
}

export async function fetchLaudusExtendedFinanceSnapshot() {
  const errors: DomainError[] = [];
  let journalEntries: Record<string, unknown>[] = [];
  let bankStatements: Record<string, unknown>[] = [];
  let dtesPending: Record<string, unknown>[] = [];

  try {
    const payload = await listLaudus('/accounting/journal/entries/list', {
      options: { offset: 0, limit: 0 },
      fields: [...LAUDUS_JOURNAL_ENTRY_FIELDS],
      orderBy: [{ field: 'journalEntryId', direction: 'ASC' }],
    });
    journalEntries = extractLaudusListRows(payload);
  } catch (error) {
    errors.push({ domain: 'journal_entries', status: safeStatus(error) });
  }

  try {
    const payload = await listLaudus('/accounting/bankStatements/list', {
      options: { offset: 0, limit: 0 },
      fields: [...LAUDUS_BANK_STATEMENT_FIELDS],
      orderBy: [{ field: 'bankStatementId', direction: 'ASC' }],
    });
    bankStatements = extractLaudusListRows(payload);
  } catch (error) {
    errors.push({ domain: 'bank_statements', status: safeStatus(error) });
  }

  try {
    const payload = await getLaudus('/DTE/pending');
    dtesPending = Array.isArray(payload)
      ? payload.filter(
          (row): row is Record<string, unknown> =>
            Boolean(row && typeof row === 'object' && !Array.isArray(row)),
        )
      : [];
  } catch (error) {
    errors.push({ domain: 'dte_pending', status: safeStatus(error) });
  }

  return {
    journalEntries,
    bankStatements,
    dtesPending,
    errors,
    calls: 4,
    availableDomains: 3 - errors.length,
  };
}
