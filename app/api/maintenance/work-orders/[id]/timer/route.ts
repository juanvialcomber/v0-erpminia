import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { findOtherRunningWorkOrder } from '@/lib/maintenance/other-running-work-order';

const TIMER_ACTIONS = new Set(['play', 'pause', 'resume', 'terminate']);

function timerErrorResponse(error: { code?: string; message?: string } | null | undefined) {
  if (error?.code === 'P0002') return NextResponse.json({ ok: false, error: 'WO not found' }, { status: 404 });
  if (error?.code === '22023') return NextResponse.json({ ok: false, error: error.message || 'Invalid action' }, { status: 400 });
  if (error?.code === '55000') return NextResponse.json({ ok: false, error: error.message || 'Invalid timer transition' }, { status: 409 });
  return NextResponse.json({ ok: false, error: error?.message || 'Internal server error' }, { status: 500 });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { id: workOrderId } = await params;
  const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, workOrderId);
  if (!guard.ok) return NextResponse.json({ ok: false, error: guard.error, record_scope: guard.scope }, { status: guard.status });

  const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  const executionAccess = await requireAssignedMaintenanceExecution(context, workOrderId);
  if (accessLevel !== 'ED' && !executionAccess.ok) return executionAccess.response;

  const body = (await request.json().catch(() => null)) as { action?: string; notes?: string | null } | null;
  const action = String(body?.action || '');
  const notes = body?.notes?.trim() || null;
  if (!TIMER_ACTIONS.has(action)) return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 });
  if (action === 'pause' && !notes) {
    return NextResponse.json({ ok: false, error: 'Debes indicar por qué pausas la orden de trabajo.' }, { status: 400 });
  }

  if (action === 'play' || action === 'resume') {
    try {
      const other = await findOtherRunningWorkOrder(context, workOrderId);
      if (other) {
        return NextResponse.json({
          ok: false,
          error: 'Primero pausa ' + (other.work_order_number || 'la otra OT') + ' e indica el motivo antes de iniciar esta orden.',
          concurrentWorkOrderId: other.id,
        }, { status: 409 });
      }
    } catch (cause) {
      console.error('[maintenance/work-order-timer:conflict]', cause);
      return NextResponse.json({ ok: false, error: 'No se pudo verificar si tienes otra OT en ejecución.' }, { status: 503 });
    }
  }

  const { data, error } = await context.supabase.rpc('update_work_order_timer', {
    p_organization_id: context.organizationId,
    p_work_order_id: workOrderId,
    p_action: action,
    p_actor_id: context.userId,
    p_actor_name: context.userName || context.userEmail || null,
    p_notes: notes,
  });

  if (error) return timerErrorResponse(error);
  return NextResponse.json(data);
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { id: workOrderId } = await params;
  const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  const assignedExecution = await requireAssignedMaintenanceExecution(context, workOrderId);
  if (accessLevel === 'SR' && !assignedExecution.ok) return assignedExecution.response;

  const { data: workOrder, error } = await context.supabase
    .from('maintenance_work_orders')
    .select('id, timer_status, timer_start_time, total_timer_seconds, total_timer_minutes, created_by')
    .eq('id', workOrderId)
    .eq('organization_id', context.organizationId)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message || 'No se pudo cargar el temporizador' }, { status: 500 });
  if (!workOrder) return NextResponse.json({ ok: false, error: 'WO not found' }, { status: 404 });

  const { data: timeline, error: timelineError } = await context.supabase
    .from('work_order_events')
    .select('id,event_type,event_at,actor_name,summary,payload')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', workOrderId)
    .like('event_type', 'timer_%')
    .order('event_at', { ascending: false })
    .limit(10);

  if (timelineError) return NextResponse.json({ ok: false, error: timelineError.message || 'No se pudo cargar el historial del temporizador' }, { status: 500 });

  const totalSeconds = Math.max(Number(workOrder.total_timer_seconds || 0), Number(workOrder.total_timer_minutes || 0) * 60);
  const totalMinutes = Math.floor(totalSeconds / 60);
  return NextResponse.json({
    ok: true,
    canEdit: Boolean(workOrder.created_by) && (accessLevel === 'ED' || assignedExecution.ok),
    record_scope: workOrder.created_by ? 'operational' : 'historical',
    current: {
      timer_status: workOrder.timer_status || 'idle',
      timer_start_time: workOrder.timer_start_time || null,
      total_seconds: totalSeconds,
      total_minutes: totalMinutes,
      total_hours: Math.round((totalSeconds / 3600) * 1000) / 1000,
    },
    timeline: timeline || [],
  });
}
