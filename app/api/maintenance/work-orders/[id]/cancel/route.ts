export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { requireModuleAccess, MODULE_KEYS } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { id } = await params;
  const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });
  }

  const body = (await request.json().catch(() => null)) as { reason?: string | null } | null;
  const reason = String(body?.reason || '').trim();
  if (reason.length < 5) {
    return NextResponse.json({ error: 'Indica el motivo de la anulación (mínimo 5 caracteres).' }, { status: 400 });
  }

  const { data: order, error: orderError } = await context.supabase
    .from('maintenance_work_orders')
    .select('id,status,timer_status,canonical_asset_id')
    .eq('organization_id', context.organizationId)
    .eq('id', id)
    .single();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  const status = String(order.status || '').toLowerCase();
  if (['completed', 'closed', 'cancelled', 'canceled'].includes(status)) {
    return NextResponse.json({ error: 'La OT ya está finalizada o anulada.' }, { status: 409 });
  }
  if (String(order.timer_status || 'idle') !== 'idle') {
    return NextResponse.json(
      { error: 'Detén el cronómetro antes de anular la OT para preservar el tiempo registrado.' },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await context.supabase
    .from('maintenance_work_orders')
    .update({
      status: 'cancelled',
      cancellation_reason: reason,
      cancelled_at: now,
      updated_at: now,
    })
    .eq('organization_id', context.organizationId)
    .eq('id', id)
    .select('*')
    .single();
  if (updateError) {
    const code = (updateError as { code?: string }).code;
    return NextResponse.json(
      { error: updateError.message || 'No se pudo anular la OT.' },
      { status: code === '55000' || code === 'P0001' ? 409 : 500 },
    );
  }

  const { error: eventError } = await context.supabase.from('work_order_events').insert({
    organization_id: context.organizationId,
    work_order_id: id,
    canonical_asset_id: order.canonical_asset_id || null,
    event_type: 'work_order_cancelled',
    event_at: now,
    actor_id: context.authUserId,
    actor_name: context.userName || context.userEmail || null,
    source_table: 'maintenance_work_orders',
    source_record_id: id,
    summary: 'Orden anulada por usuario autorizado',
    payload: { reason },
  });
  if (eventError) {
    console.error('[maintenance/work-order-cancel:event]', eventError);
  }

  return NextResponse.json({ data: updated });
}
