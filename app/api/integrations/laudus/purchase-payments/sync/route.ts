export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { fetchAllLaudusPurchasePayments } from '@/lib/integrations/laudus/purchase-payments';

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;

  if (!access.admin) {
    return NextResponse.json(
      { error: 'La sincronización de pagos Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  const { rows, calls } = await fetchAllLaudusPurchasePayments();
  const db = getSupabaseServerClient();

  const { data, error } = await db.rpc('motil_ingest_laudus_purchase_payments', {
    p_organization_id: access.organizationId,
    p_payments: rows,
  });

  if (error) {
    console.error('[laudus/purchase-payments/sync]', error.message);
    return NextResponse.json(
      {
        status: 'partial',
        source: 'Laudus',
        mode: 'read_only',
        calls: calls + 1,
        paymentsRead: rows.length,
        canonicalMutated: false,
        laudusMutated: false,
        error: 'La lectura Laudus fue correcta, pero no fue posible completar el staging de pagos.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: 'ok',
    source: 'Laudus',
    mode: 'read_only',
    calls: calls + 1,
    paymentsRead: rows.length,
    result: data,
    canonicalMutated: false,
    laudusMutated: false,
  });
}
