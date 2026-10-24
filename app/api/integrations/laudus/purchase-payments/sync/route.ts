export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { fetchAllLaudusPurchasePayments, LAUDUS_PAYMENT_FIELDS } from '@/lib/integrations/laudus/purchase-payments';
import { describeLaudusPayloadShape, listLaudus } from '@/lib/integrations/laudus/client';

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


export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const payload = await listLaudus('/purchases/payments/list', {
    options: { offset: 0, limit: 5 },
    fields: [...LAUDUS_PAYMENT_FIELDS],
  });

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_contract_probe',
    persisted: false,
    calls: 2,
    ...describeLaudusPayloadShape(payload),
  });
}
