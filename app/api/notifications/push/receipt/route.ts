export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { authenticPilotReceipt, pilotReceiptPatch, validPilotReceipt } from '@/lib/notifications/pilot-receipts';

export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  if (ctx.userEmail?.trim().toLowerCase() !== 'juan@n3uralia.com')
    return NextResponse.json({ error: 'Prueba reservada al usuario piloto' }, { status: 403 });
  const body = await request.json().catch(() => null);
  if (!validPilotReceipt(body)) return NextResponse.json({ error: 'Confirmación no válida' }, { status: 400 });
  const { data: subscription, error } = await ctx.supabase.from('user_push_subscriptions')
    .select('id,last_test_at,last_test_receipt_hash').eq('organization_id', ctx.organizationId)
    .eq('user_id', ctx.userId).eq('enabled', true).eq('last_test_id', body.testId).maybeSingle();
  if (error) return NextResponse.json({ error: 'No fue posible verificar la prueba' }, { status: 500 });
  if (!subscription || !authenticPilotReceipt(body.token, subscription.last_test_receipt_hash, subscription.last_test_at))
    return NextResponse.json({ error: 'Confirmación inválida o vencida' }, { status: 403 });
  const { error: updateError } = await ctx.supabase.from('user_push_subscriptions')
    .update(pilotReceiptPatch(body.stage, new Date().toISOString()))
    .eq('id', subscription.id).eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId)
    .eq('enabled', true).eq('last_test_id', body.testId).eq('last_test_receipt_hash', subscription.last_test_receipt_hash);
  if (updateError) return NextResponse.json({ error: 'No fue posible guardar la confirmación' }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
