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

  const { data, error } = await context.supabase.rpc('cancel_work_order_safely', {
    p_organization_id: context.organizationId,
    p_work_order_id: id,
    p_reason: reason,
    p_actor_id: context.authUserId,
    p_actor_name: context.userName || context.userEmail || null,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    const status = code === 'P0002' ? 404
      : code === '22023' ? 400
        : code === '55000' || code === 'P0001' ? 409
          : 500;
    return NextResponse.json({ error: error.message || 'No se pudo anular la OT.' }, { status });
  }

  return NextResponse.json({ data });
}
