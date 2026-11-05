export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { resolveRecordedWorkHours } from '@/lib/maintenance/recorded-work-time.mjs';

type MaintenanceWorkOrderRow = {
  id: string;
  asset_id: string | null;
  start_date: string | null;
  timer_status?: string | null;
  total_timer_seconds?: number | null;
  total_timer_minutes?: number | null;
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

    // Una pausa prolongada conserva solo tiempo confirmado hasta que el
    // ejecutor declare las horas reales de la sesión no verificada.
    const { data: latestTimerReview, error: timerReviewError } = await context.supabase
      .from('work_order_events')
      .select('event_type')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id)
      .in('event_type', ['timer_pause_review_required', 'timer_duration_declared'])
      .order('event_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (timerReviewError) throw timerReviewError;
    if (latestTimerReview?.event_type === 'timer_pause_review_required') {
      return NextResponse.json({
        error: 'Antes de cerrar, declara el tiempo efectivamente trabajado en el tramo prolongado. Las horas nocturnas no se incorporarán automáticamente.',
        timer_review_required: true,
      }, { status: 409 });
    }

    const { data: timerState, error: timerStateError } = await context.supabase
      .from('maintenance_work_orders')
      .select('timer_status,timer_start_time')
      .eq('organization_id', context.organizationId)
      .eq('id', id)
      .single();
    if (timerStateError) throw timerStateError;
    if (timerState.timer_status === 'running' && timerState.timer_start_time) {
      const elapsedSeconds = (Date.now() - new Date(timerState.timer_start_time).getTime()) / 1000;
      if (Number.isFinite(elapsedSeconds) && elapsedSeconds >= 16 * 60 * 60) {
        return NextResponse.json({
          error: 'El cronómetro sigue activo desde hace 16 horas o más. Detén la OT y solicita una corrección supervisada del tiempo antes de cerrar; no se contabilizará automáticamente el período no verificado.',
          timer_review_required: true,
        }, { status: 409 });
      }
    }
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

    let downtime = 0;
    if (typedWorkOrder.start_date) {
      const startTime = new Date(typedWorkOrder.start_date);
      downtime = Math.max(0, (Date.now() - startTime.getTime()) / (1000 * 60 * 60));
    }

    // Tiempo de ejecución y detención del activo son métricas diferentes.
    // Nunca sumar tiempo de noche/pausa al trabajo efectivo ni permitir que
    // una declaración manual sobrescriba un cronómetro ya registrado.
    const effectiveHours = resolveRecordedWorkHours({
      totalTimerSeconds: typedWorkOrder.total_timer_seconds,
      totalTimerMinutes: typedWorkOrder.total_timer_minutes,
      manualHours: actual_duration_hours,
      storedHours: typedWorkOrder.actual_duration_hours,
    });
    const closureData: Record<string, unknown> = { actual_duration_hours: effectiveHours, down_time_hours: downtime, updated_at: new Date().toISOString() };
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

    if (typedWorkOrder.asset_id) {
      const today = new Date().toISOString().split('T')[0];
      const availabilityPercent = Math.max(0, 100 - (downtime / 24) * 100);
      const { error: availError } = await context.supabase.from('equipment_availability').upsert({
        equipment_id: typedWorkOrder.asset_id,
        date: today,
        availability_percentage: availabilityPercent,
        downtime_minutes: Math.round(downtime * 60),
        total_minutes: 24 * 60,
      }, { onConflict: 'equipment_id,date' });
      if (availError) console.error('[maintenance] Availability update error:', availError);
    }

    return NextResponse.json({ data: updatedOT, mttr: effectiveHours, downtime_hours: downtime, availability_percentage: Math.max(0, 100 - (downtime / 24) * 100) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cerrar la orden de trabajo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
