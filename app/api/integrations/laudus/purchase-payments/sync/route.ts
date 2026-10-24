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

  const db = getSupabaseServerClient();
  const { data: bounds, error: boundsError } = await db.rpc('motil_get_laudus_invoice_staging_bounds', {
    p_organization_id: access.organizationId,
  });
  if (boundsError || !bounds?.first_issued_date) {
    return NextResponse.json(
      { status: 'empty', calls: 0, canonicalMutated: false, laudusMutated: false },
      { status: 404 },
    );
  }

  const start = new Date(bounds.first_issued_date);
  const end = new Date();
  const { rows, calls } = await fetchAllLaudusPurchasePayments(start, end);

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


