export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';

type MaintenanceWorkOrderRow = {
  id: string;
  asset_id: string | null;
  timer_status?: string | null;
  actual_duration_hours?: number | string | null;
};
type CloseWorkOrderPayload = { actual_duration_hours?: number | string | null; root_cause?: string | null; preventive_actions?: string | null };

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  try {
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const executionAccess = await requireAssignedMaintenanceExecution(context, id);
    if (!executionAccess.ok) return executionAccess.response;

    const { data: fluidDeclaration, error: fluidDeclarationError } = await context.supabase
      .from('work_order_events')
      .select('id,event_at,actor_id,actor_name,payload')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id)
      .eq('event_type', 'fluid_closure_declared')
      .order('event_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fluidDeclarationError) throw fluidDeclarationError;
    if (!fluidDeclaration) {
      return NextResponse.json(
        { error: 'Antes de cerrar, el mecánico asignado debe confirmar los aceites/fluidos utilizados y el estado del residuo.' },
        { status: 409 },
      );
    }
    if (fluidDeclaration.actor_id !== context.userId) {
      return NextResponse.json(
        { error: 'La declaración de aceites/fluidos debe ser realizada por el mecánico asignado que está cerrando la OT.' },
        { status: 409 },
      );
    }

    const fluidPayload = (fluidDeclaration.payload || {}) as Record<string, unknown>;
    if (fluidPayload.declared_by_assigned_executor !== true || typeof fluidPayload.fluids_used !== 'boolean') {
      return NextResponse.json(
        { error: 'La declaración de aceites/fluidos no es válida para cierre. Vuelve a confirmarla como mecánico asignado.' },
        { status: 409 },
      );
    }

    const { data: currentFluidUsage, error: currentFluidUsageError } = await context.supabase
      .from('maintenance_fluid_usage_records')
      .select('id,used_at')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id);
    if (currentFluidUsageError) throw currentFluidUsageError;

    const currentUsageCount = (currentFluidUsage || []).length;
    const declaredUsageCount = Number(fluidPayload.fluid_usage_count || 0);
    if (currentUsageCount !== declaredUsageCount) {
      return NextResponse.json(
        { error: 'Los datos de aceites/fluidos cambiaron después de la confirmación. El mecánico debe revisar y confirmar nuevamente antes de cerrar.' },
        { status: 409 },
      );
    }

    const { count: evidenceCount, error: evidenceError } = await context.supabase
      .from('work_order_evidence_files')
      .select('id', { head: true, count: 'exact' })
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id)
      .eq('evidence_type', 'photo');
    if (evidenceError) throw evidenceError;
    if ((evidenceCount || 0) < 1) return NextResponse.json({ error: 'Agrega al menos una foto como evidencia antes de cerrar la OT.' }, { status: 409 });

    const { data: timerState, error: timerStateError } = await context.supabase
      .from('maintenance_work_orders')
      .select('timer_status')
      .eq('organization_id', context.organizationId)
      .eq('id', id)
      .single();
    if (timerStateError) throw timerStateError;
    if (['running', 'paused'].includes(String(timerState.timer_status || ''))) {
      const { error: terminateError } = await context.supabase.rpc('update_work_order_timer', {
        p_organization_id: context.organizationId,
        p_work_order_id: id,
        p_action: 'terminate',
        p_actor_id: context.userId,
        p_actor_name: context.userName || context.userEmail || null,
        p_notes: 'Cierre de OT',
      });
      if (terminateError) throw terminateError;
    }

    const body = (await request.json()) as CloseWorkOrderPayload;
    const { actual_duration_hours, root_cause, preventive_actions } = body;
    const { data: workOrder, error: woError } = await context.supabase.from('maintenance_work_orders').select('*').eq('id', id).eq('organization_id', context.organizationId).single();
    const typedWorkOrder = workOrder as MaintenanceWorkOrderRow | null;
    if (woError || !typedWorkOrder) return NextResponse.json({ error: 'No se encontró la orden de trabajo' }, { status: 404 });

    const normalizedHours = Number(actual_duration_hours);
    const timerHours = Number(typedWorkOrder.actual_duration_hours || 0);
    const effectiveHours = Math.max(
      Number.isFinite(normalizedHours) && normalizedHours > 0 ? normalizedHours : 0,
      Number.isFinite(timerHours) && timerHours > 0 ? timerHours : 0,
    );
    const closureData: Record<string, unknown> = {
      actual_duration_hours: effectiveHours,
      updated_at: new Date().toISOString(),
    };
    if (root_cause !== undefined) closureData.root_cause = root_cause;
    if (preventive_actions !== undefined) closureData.preventive_actions = preventive_actions;

    const { error: detailError } = await context.supabase.from('maintenance_work_orders').update(closureData).eq('id', id).eq('organization_id', context.organizationId);
    if (detailError) throw detailError;

    const { error: closeError } = await context.supabase.rpc('close_work_order_safely', { p_work_order_id: id });
    if (closeError) {
      const status = closeError.code === '55000' || closeError.code === 'P0001' ? 409 : 500;
      return NextResponse.json({ error: closeError.message || 'No se pudo cerrar la orden de trabajo' }, { status });
    }

    const { data: updatedOT, error: reloadError } = await context.supabase.from('maintenance_work_orders').select('*').eq('id', id).eq('organization_id', context.organizationId).single();
    if (reloadError) throw reloadError;

    return NextResponse.json({ data: updatedOT, actual_duration_hours: effectiveHours });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cerrar la orden de trabajo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
