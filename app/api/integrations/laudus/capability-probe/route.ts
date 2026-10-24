export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { describeLaudusPayloadShape, listLaudus } from '@/lib/integrations/laudus/client';

const CANDIDATES = [
  '/accounting/entries/list',
  '/accounting/journalEntries/list',
  '/accounting/vouchers/list',
  '/accounting/accountingEntries/list',
  '/accounting/bankStatements/list',
  '/accounting/bankstatements/list',
  '/accounting/statements/list',
  '/accounting/bankTransactions/list',
  '/purchases/creditNotes/list',
  '/purchases/creditnotes/list',
  '/purchases/accountsPayable/list',
  '/purchases/accountspayable/list',
  '/purchases/payables/list',
  '/electronicDocuments/list',
  '/electronicdocuments/list',
  '/tax/dtes/list',
  '/purchases/dtes/list',
] as const;

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null, { status: 404 });
  }

  const results: Array<{
    path: string;
    ok: boolean;
    status: number | null;
    shape?: ReturnType<typeof describeLaudusPayloadShape>;
  }> = [];

  for (const path of CANDIDATES) {
    try {
      const payload = await listLaudus(path, { options: { offset: 0, limit: 1 } });
      results.push({
        path,
        ok: true,
        status: 200,
        shape: describeLaudusPayloadShape(payload),
      });
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? Number((error as { status?: unknown }).status) || null
          : null;
      results.push({ path, ok: false, status });
    }
  }

  return NextResponse.json({
    mode: 'preview_probe',
    rowsReturned: false,
    laudusMutated: false,
    canonicalMutated: false,
    results,
  });
}
