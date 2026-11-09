import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { getWorkOrderReleaseReadiness } from '@/lib/maintenance/work-order-release-readiness';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { id: targetWorkOrderId } = await params;
  const body = (await request.json().catch(() => null)) as {
    fromWorkOrderId?: string;
    notes?: string | null;
  } | null;

  const fromWorkOrderId = String(body?.fromWorkOrderId || '').trim();
  const notes = String(body?.notes || '').trim();
  if (!fromWorkOrderId) {
    return NextResponse.json({ ok: false, error: 'Falta la OT que estás dejando.' }, { status: 400 });
  }
  if (notes.length < 5) {
    return NextResponse.json({ ok: false, error: 'Describe por qué cambias de OT (mínimo 5 caracteres).' }, { status: 400 });
  }

  const [sourceScope, targetScope] = await Promise.all([
    requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, fromWorkOrderId),
    requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, targetWorkOrderId),
  ]);
  if (!sourceScope.ok) {
    return NextResponse.json({ ok: false, error: sourceScope.error, record_scope: sourceScope.scope }, { status: sourceScope.status });
  }
  if (!targetScope.ok) {
    return NextResponse.json({ ok: false, error: targetScope.error, record_scope: targetScope.scope }, { status: targetScope.status });
  }

  const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  const [sourceExecution, targetExecution] = await Promise.all([
    requireAssignedMaintenanceExecution(context, fromWorkOrderId),
    requireAssignedMaintenanceExecution(context, targetWorkOrderId),
  ]);
  const elevated = accessLevel === 'ED' && context.role !== 'tecnico';
  if (!elevated && !sourceExecution.ok) return sourceExecution.response;
  if (!elevated && !targetExecution.ok) return targetExecution.response;

  const readiness = await getWorkOrderReleaseReadiness(
    context.supabase,
    context.organizationId,
    targetWorkOrderId,
  );
  if (!readiness.ready) {
    return NextResponse.json({
      ok: false,
      error: 'La OT destino no está preparada para ejecución.',
      blockers: readiness.blockers,
      emergencyBypass: readiness.emergencyBypass,
    }, { status: 409 });
  }

  const { data, error } = await context.supabase.rpc('switch_work_order_timer', {
    p_organization_id: context.organizationId,
    p_from_work_order_id: fromWorkOrderId,
    p_to_work_order_id: targetWorkOrderId,
    p_actor_id: context.userId,
    p_actor_name: context.userName || context.userEmail || null,
    p_notes: notes,
  });

  if (error?.code === 'P0002') return NextResponse.json({ ok: false, error: 'OT no encontrada.' }, { status: 404 });
  if (error?.code === '22023') return NextResponse.json({ ok: false, error: error.message || 'Cambio de OT inválido.' }, { status: 400 });
  if (error?.code === '55000' || error?.code === '23505') {
    return NextResponse.json({ ok: false, error: error.message || 'No se pudo cambiar de OT por un conflicto de cronómetro.' }, { status: 409 });
  }
  if (error) return NextResponse.json({ ok: false, error: error.message || 'No se pudo cambiar de OT.' }, { status: 500 });

  return NextResponse.json(data);
}
