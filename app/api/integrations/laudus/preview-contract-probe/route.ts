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

function normalizeNumberish(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const allowed =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'fix/laudus-accounting-suppliers-20261103';

  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const suppliersPayload = await listLaudus('/purchases/suppliers/list', {
    options: { offset: 0, limit: 5 },
    fields: ['supplierId','name','legalName','VATId','email','phone','city'],
  });

  const journalPayload = await listLaudus('/accounting/journal/entries/list', {
    options: { offset: 0, limit: 5 },
    fields: ['journalEntryId','journalEntryNumber','date','type','approved','lines.debit','lines.credit'],
    orderBy: [{ field: 'date', direction: 'DESC' }],
  });

  const suppliers = rowsFrom(suppliersPayload);
  const journals = rowsFrom(journalPayload);
  const normalizedLineValues = journals.flatMap((row) => Array.isArray(row.lines) ? row.lines : []).map((line: any) => ({
    debit: normalizeNumberish(line?.debit),
    credit: normalizeNumberish(line?.credit),
  }));

  return NextResponse.json({
    ok: true,
    persisted: false,
    suppliers: { rows: suppliers.length, idsPresent: suppliers.every((row) => row.supplierId != null) },
    journals: {
      rows: journals.length,
      idsPresent: journals.every((row) => row.journalEntryId != null),
      numericLinesValid: normalizedLineValues.every((line) =>
        (line.debit === null || Number.isFinite(line.debit)) &&
        (line.credit === null || Number.isFinite(line.credit))
      ),
      sample: journals.map((row) => ({
        journalEntryId: row.journalEntryId ?? null,
        journalEntryNumber: row.journalEntryNumber ?? null,
        date: row.date ?? null,
        type: row.type ?? null,
        lines: Array.isArray(row.lines) ? row.lines.map((line: any) => ({
          debit: normalizeNumberish(line?.debit),
          credit: normalizeNumberish(line?.credit),
        })) : [],
      })),
    },
  });
}
