export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { fetchLaudusPurchaseLedgerRange } from '@/lib/integrations/laudus/purchase-ledger';

const ORGANIZATION_ID = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = getSupabaseServerClient();
  const { data: bounds, error: boundsError } = await db.rpc('motil_get_laudus_invoice_staging_bounds', {
    p_organization_id: ORGANIZATION_ID,
  });

  if (
    boundsError ||
    !bounds?.first_issued_date ||
    !bounds?.last_issued_date ||
    Number(bounds?.invoice_count ?? 0) === 0
  ) {
    return NextResponse.json({
      status: 'empty',
      databaseCode: boundsError?.code ?? null,
      canonicalMutated: false,
      laudusMutated: false,
    });
  }

  const start = new Date(bounds.first_issued_date);
  const end = new Date(bounds.last_issued_date);
  const { rows, calls } = await fetchLaudusPurchaseLedgerRange(start, end);

  let updated = 0;
  let missing = 0;
  for (let index = 0; index < rows.length; index += 500) {
    const { data, error } = await db.rpc('motil_rehydrate_laudus_invoice_totals', {
      p_organization_id: ORGANIZATION_ID,
      p_rows: rows.slice(index, index + 500),
    });
    if (error) {
      return NextResponse.json({
        status: 'partial',
        databaseCode: error.code ?? null,
        calls,
        ledgerRowsRead: rows.length,
        updated,
        missing,
        canonicalMutated: false,
        laudusMutated: false,
      }, { status: 500 });
    }
    updated += Number(data?.updated ?? 0);
    missing += Number(data?.missing_staged_invoice ?? 0);
  }

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_preview_one_shot',
    calls,
    ledgerRowsRead: rows.length,
    updated,
    missing,
    startMonth: start.toISOString().slice(0, 7),
    endMonth: end.toISOString().slice(0, 7),
    canonicalMutated: false,
    laudusMutated: false,
  });
}
