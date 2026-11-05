export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';

type MaintenanceWorkOrderRow = {
  id: string;
  asset_id: string | null;
  timer_status?: string | null;
  total_timer_seconds?: number | string | null;
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

    const body = (await request.json().catch(() => null)) as CloseWorkOrderPayload | null;
    if (!body) return NextResponse.json({ error: 'Solicitud de cierre inválida.' }, { status: 400 });

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
      .select('id,used_at,updated_at')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id);
    if (currentFluidUsageError) throw currentFluidUsageError;

    const currentUsageCount = (currentFluidUsage || []).length;
    const declaredUsageCount = Number(fluidPayload.fluid_usage_count || 0);
    const declarationAtMs = Date.parse(String(fluidDeclaration.event_at || ''));
    const fluidChangedAfterDeclaration = (currentFluidUsage || []).some((row) => {
      const changedAtMs = Date.parse(String(row.updated_at || row.used_at || ''));
      return Number.isFinite(declarationAtMs) && Number.isFinite(changedAtMs) && changedAtMs > declarationAtMs;
    });
    const { data: currentWasteEvents, error: currentWasteError } = await context.supabase
      .from('work_order_events')
      .select('payload')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id)
      .eq('event_type', 'waste_generated');
    if (currentWasteError) throw currentWasteError;
    const currentUsageIds = new Set((currentFluidUsage || []).map((row) => String(row.id)));
    const currentLinkedWasteCount = new Set(
      (currentWasteEvents || [])
        .map((event) => String((event.payload as any)?.source_fluid_usage_id || ''))
        .filter((usageId) => usageId && currentUsageIds.has(usageId)),
    ).size;
    const declaredLinkedWasteCount = Number(fluidPayload.linked_waste_count || 0);
    if (
      currentUsageCount !== declaredUsageCount
      || currentLinkedWasteCount !== declaredLinkedWasteCount
      || fluidChangedAfterDeclaration
    ) {
      return NextResponse.json(
        { error: 'Los datos de aceites/fluidos o residuos cambiaron después de la confirmación. El mecánico debe revisar y confirmar nuevamente antes de cerrar.' },
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

    const [{ data: timerState, error: timerStateError }, { data: closeReadiness, error: closeReadinessError }] = await Promise.all([
      context.supabase
        .from('maintenance_work_orders')
        .select('timer_status')
        .eq('organization_id', context.organizationId)
        .eq('id', id)
        .single(),
      context.supabase
        .from('work_order_close_readiness_v2')
        .select('ready_to_close,next_action')
        .eq('organization_id', context.organizationId)
        .eq('work_order_id', id)
        .maybeSingle(),
    ]);
    if (timerStateError) throw timerStateError;
    if (closeReadinessError) throw closeReadinessError;
    const activeTimer = ['running', 'paused'].includes(String(timerState.timer_status || ''));
    const allowedTimerOnlyBlocker = activeTimer && closeReadiness?.next_action === 'record_actual_hours';
    if (closeReadiness && !closeReadiness.ready_to_close && closeReadiness.next_action !== 'close_work_order' && !allowedTimerOnlyBlocker) {
      return NextResponse.json(
        {
          error: 'La OT todavía tiene pasos pendientes antes del cierre.',
          next_action: closeReadiness.next_action,
        },
        { status: 409 },
      );
    }
    if (activeTimer) {
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

    const { actual_duration_hours, root_cause, preventive_actions } = body;
    const { data: workOrder, error: woError } = await context.supabase.from('maintenance_work_orders').select('*').eq('id', id).eq('organization_id', context.organizationId).single();
    const typedWorkOrder = workOrder as MaintenanceWorkOrderRow | null;
    if (woError || !typedWorkOrder) return NextResponse.json({ error: 'No se encontró la orden de trabajo' }, { status: 404 });

    const normalizedHours = Number(actual_duration_hours);
    const totalTimerSeconds = Number(typedWorkOrder.total_timer_seconds || 0);
    const timerHours = Number.isFinite(totalTimerSeconds) && totalTimerSeconds > 0
      ? totalTimerSeconds / 3600
      : 0;
    const effectiveHours = timerHours > 0
      ? timerHours
      : Number.isFinite(normalizedHours) && normalizedHours > 0
        ? normalizedHours
        : Number(typedWorkOrder.actual_duration_hours || 0);
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
    const typed = error as { code?: string; message?: string };
    const message = typed?.message || (error instanceof Error ? error.message : 'No se pudo cerrar la orden de trabajo');
    const status = typed?.code === '55000' || typed?.code === 'P0001' || typed?.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
