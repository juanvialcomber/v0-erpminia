export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Issuing a reserved material writes warehouse_stock and stock_movements.
  // This is not a read action: require the same ED permission as individual
  // work-order part delivery, before any privileged stock RPC is reached.
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (access.user.id !== context.userId || access.organizationId !== context.organizationId) {
    return NextResponse.json({ error: 'No se pudo comprobar la organización del usuario.' }, { status: 403 });
  }

  try {
    const { id } = await params;
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const { data, error } = await context.supabase.rpc('issue_available_materials_to_work_order', { p_work_order_id: id });
    if (error) throw error;
    return NextResponse.json(data || { work_order_id: id, lines_issued: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron entregar los materiales disponibles';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
