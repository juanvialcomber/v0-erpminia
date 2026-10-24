import { getLaudus } from './client';

type LedgerRow = Record<string, unknown>;

function extractRows(payload: unknown): LedgerRow[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return [];
  const rows = (payload as Record<string, unknown>).rows;
  if (!Array.isArray(rows)) return [];
  return rows.filter(
    (row): row is LedgerRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)),
  );
}

function monthRange(start: Date, end: Date) {
  const months: Array<{ year: number; month: number }> = [];
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1;
  const endYear = end.getUTCFullYear();
  const endMonth = end.getUTCMonth() + 1;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

export async function fetchLaudusPurchaseLedgerRange(start: Date, end: Date) {
  const rows: LedgerRow[] = [];
  let calls = 0;

  for (const period of monthRange(start, end)) {
    const payload = await getLaudus('/purchases/invoices/ledger', period);
    rows.push(...extractRows(payload));
    calls += 1;
  }

  return { rows, calls };
}
