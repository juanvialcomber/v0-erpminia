export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { fetchAllLaudusPurchasePayments } from '@/lib/integrations/laudus/purchase-payments';

const ORGANIZATION_ID = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = getSupabaseServerClient();
  const { data: bounds, error: boundsError } = await db.rpc('motil_get_laudus_invoice_staging_bounds', {
    p_organization_id: ORGANIZATION_ID,
  });
  if (boundsError || !bounds?.first_issued_date) {
    return NextResponse.json({
      status: 'empty',
      databaseCode: boundsError?.code ?? null,
      canonicalMutated: false,
      laudusMutated: false,
    });
  }

  const start = new Date(bounds.first_issued_date);
  const end = new Date('2026-10-24T23:59:59-03:00');
  const { rows, calls } = await fetchAllLaudusPurchasePayments(start, end);

  const { data, error } = await db.rpc('motil_ingest_laudus_purchase_payments', {
    p_organization_id: ORGANIZATION_ID,
    p_payments: rows,
  });

  if (error) {
    return NextResponse.json({
      status: 'partial',
      databaseCode: error.code ?? null,
      calls,
      paymentRowsRead: rows.length,
      canonicalMutated: false,
      laudusMutated: false,
    }, { status: 500 });
  }

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_payment_one_shot',
    calls,
    paymentRowsRead: rows.length,
    result: data,
    canonicalMutated: false,
    laudusMutated: false,
  });
}
