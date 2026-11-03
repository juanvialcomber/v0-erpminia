export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listLaudus } from '@/lib/integrations/laudus/client';

function rowsFrom(payload: unknown) {
  if (Array.isArray(payload)) return payload.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) as Record<string, any>[];
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data','items','results','rows']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).filter((row) => row && typeof row === 'object' && !Array.isArray(row)) as Record<string, any>[];
  }
  return [];
}

export async function GET() {
  const allowed =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'feat/laudus-accounting-backfill-20261103';
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const from = '2021-08-01';
  const to = '2021-08-07';
  const payload = await listLaudus('/accounting/journal/entries/list', {
    options: { offset: 0, limit: 10 },
    fields: ['journalEntryId','date'],
    filterBy: [
      { field: 'date', operator: '>=', value: from + 'T00:00:00' },
      { field: 'date', operator: '<=', value: to + 'T23:59:59.999' },
    ],
    orderBy: [
      { field: 'date', direction: 'ASC' },
      { field: 'journalEntryId', direction: 'ASC' },
    ],
  });

  const rows = rowsFrom(payload);
  const dates = rows.map((row) => typeof row.date === 'string' ? row.date : null).filter(Boolean) as string[];
  const inRange = dates.every((date) => date.slice(0,10) >= from && date.slice(0,10) <= to);
  return NextResponse.json({
    ok: inRange,
    persisted: false,
    from,
    to,
    rows: rows.length,
    minDate: dates.length ? dates.reduce((a,b)=>a<b?a:b) : null,
    maxDate: dates.length ? dates.reduce((a,b)=>a>b?a:b) : null,
  });
}
