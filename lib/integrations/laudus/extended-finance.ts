import { getLaudus, listLaudus } from './client';
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

export async function fetchLaudusExtendedFinanceSnapshot() {
  const [journalPayload, bankPayload, dtePayload] = await Promise.all([
    listLaudus('/accounting/journal/entries/list', {
      options: { offset: 0, limit: 0 },
      fields: [...LAUDUS_JOURNAL_ENTRY_FIELDS],
      orderBy: [{ field: 'journalEntryId', direction: 'ASC' }],
    }),
    listLaudus('/accounting/bankStatements/list', {
      options: { offset: 0, limit: 0 },
      fields: [...LAUDUS_BANK_STATEMENT_FIELDS],
      orderBy: [{ field: 'bankStatementId', direction: 'ASC' }],
    }),
    getLaudus('/DTE/pending'),
  ]);

  return {
    journalEntries: extractLaudusListRows(journalPayload),
    bankStatements: extractLaudusListRows(bankPayload),
    dtesPending: Array.isArray(dtePayload)
      ? dtePayload.filter(
          (row): row is Record<string, unknown> =>
            Boolean(row && typeof row === 'object' && !Array.isArray(row)),
        )
      : [],
    calls: 4,
  };
}
