export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { findOtherRunningWorkOrder } from '@/lib/maintenance/other-running-work-order';

const TIMER_ACTIONS = new Set(['play', 'pause', 'resume', 'terminate', 'declare_elapsed']);

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

  const body = (await request.json().catch(() => null)) as { action?: string; notes?: string | null; elapsedSeconds?: number } | null;
  const action = String(body?.action || '');
  const notes = body?.notes?.trim() || null;
  if (!TIMER_ACTIONS.has(action)) return NextResponse.json({ ok: false, error: 'Invalid action' }, { status: 400 });
  if (action === 'pause' && !notes) {
    return NextResponse.json({ ok: false, error: 'Debes indicar por qué pausas la orden de trabajo.' }, { status: 400 });
  }

  if (action === 'declare_elapsed') {
    const elapsedSeconds = Number(body?.elapsedSeconds);
    if (!Number.isSafeInteger(elapsedSeconds) || elapsedSeconds < 0 || !notes || notes.length < 5) {
      return NextResponse.json({ ok: false, error: 'Indica las horas y minutos efectivos, y explica cómo los verificaste.' }, { status: 400 });
    }
    const { data: declared, error: declarationError } = await context.supabase.rpc('declare_overlong_work_order_elapsed_time', {
      p_organization_id: context.organizationId,
      p_work_order_id: workOrderId,
      p_actor_id: context.userId,
      p_actor_name: context.userName || context.userEmail || null,
      p_elapsed_seconds: elapsedSeconds,
      p_notes: notes,
    });
    if (declarationError) return timerErrorResponse(declarationError);
    return NextResponse.json(declared, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (action === 'pause' || action === 'terminate') {
    const { data: running, error: readError } = await context.supabase
      .from('maintenance_work_orders')
      .select('timer_status,timer_start_time')
      .eq('id', workOrderId)
      .eq('organization_id', context.organizationId)
      .single();
    if (readError) return timerErrorResponse(readError);
    if (running.timer_status === 'running' && running.timer_start_time) {
      const elapsedSeconds = (Date.now() - new Date(running.timer_start_time).getTime()) / 1000;
      if (Number.isFinite(elapsedSeconds) && elapsedSeconds >= 16 * 60 * 60) {
        if (action === 'terminate') {
          return NextResponse.json({ ok: false, error: 'Hay una sesión de 16 horas o más sin pausa confirmada. Primero registra una pausa y declara el tiempo efectivo; no se cobrará la noche como trabajo.', timer_review_required: true }, { status: 409 });
        }
        const { data: safePause, error: pauseError } = await context.supabase.rpc('pause_overlong_work_order_timer_for_review', {
          p_organization_id: context.organizationId,
          p_work_order_id: workOrderId,
          p_actor_id: context.userId,
          p_actor_name: context.userName || context.userEmail || null,
          p_notes: notes,
        });
        if (pauseError) return timerErrorResponse(pauseError);
        return NextResponse.json(safePause, { headers: { 'Cache-Control': 'no-store' } });
      }
    }
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
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
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

  const { data: latestReview, error: reviewError } = await context.supabase
    .from('work_order_events')
    .select('event_type,payload')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', workOrderId)
    .in('event_type', ['timer_pause_review_required', 'timer_duration_declared'])
    .order('event_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (reviewError) return timerErrorResponse(reviewError);
  const pendingReview = latestReview?.event_type === 'timer_pause_review_required'
    ? {
        unverified_seconds: Number(latestReview.payload?.unverified_elapsed_seconds || 0),
        credited_seconds_before: Number(latestReview.payload?.credited_seconds_before || 0),
      }
    : null;

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
      pending_review: pendingReview,
    },
    timeline: timeline || [],
  }, { headers: { 'Cache-Control': 'no-store' } });
}
