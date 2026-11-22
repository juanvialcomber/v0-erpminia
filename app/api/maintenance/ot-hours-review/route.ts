export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getUserModuleAccess, isAdminRole, MODULE_KEYS } from '@/lib/api/module-access';
import { resolveMaintenanceViewerMode } from '@/lib/maintenance/viewer-mode';
import { canReviewMaterialAttention } from '@/lib/maintenance/material-attention.mjs';
import { extractClockReviewRefs, summarizeClockReview } from '@/lib/maintenance/ot-hours-review.mjs';

const HEADERS = { 'Cache-Control': 'private, no-store' };
const SOURCE_REFERENCE = 'tldv-bodega-2026-11-16:ot_clock';
const MAX_EVENTS = 240;

/**
 * Read-only review: the source task is already assigned to Ariel. No second
 * task is created, and the OT mechanic, approval and stock states are untouched.
 */
export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const rights = await getUserModuleAccess(context.userId);
    const admin = isAdminRole(context.role);
    const mode = resolveMaintenanceViewerMode(rights.cargoName);
    const access = admin ? 'ED' : (rights.access[MODULE_KEYS.MANT_OPERACIONES] || 'SR');
    if (!admin && !canReviewMaterialAttention(mode, access)) {
      return NextResponse.json({ error: 'La revisión de tiempos corresponde a planificación.' }, { status: 403, headers: HEADERS });
    }
    const db = context.supabase;
    const { data: task, error: taskError } = await db
      .from('motil_operational_commitments')
      .select('id,title,detail,status,source_reference')
      .eq('organization_id', context.organizationId)
      .eq('assignee_profile_id', context.userId)
      .eq('source_reference', SOURCE_REFERENCE)
      .in('status', ['open', 'in_progress', 'blocked'])
      .limit(1)
      .maybeSingle();
    if (taskError) throw taskError;
    if (!task) {
      return NextResponse.json({
        assigned: false, state: 'not_assigned', items: [], totalCases: 0,
      }, { headers: HEADERS });
    }

    const refs = extractClockReviewRefs(task.detail);
    if (!refs.length) {
      return NextResponse.json({
        assigned: true, state: 'no_references', items: [], totalCases: 0,
        taskId: task.id, taskTitle: task.title,
      }, { headers: HEADERS });
    }

    const { data: orders, count: orderCount, error: ordersError } = await db
      .from('maintenance_work_orders')
      .select('id,work_order_number,status,timer_status,timer_start_time,total_timer_seconds,actual_duration_hours,planned_duration_hours', { count: 'exact' })
      .eq('organization_id', context.organizationId)
      .in('work_order_number', refs)
      .limit(8);
    if (ordersError || orderCount === null) throw ordersError || new Error('OT coverage unavailable');
    if (orderCount > refs.length || orderCount > (orders || []).length) {
      throw new Error('Ambiguous or incomplete OT references');
    }
    const ids = (orders || []).map((order) => order.id);
    let events: Array<{ work_order_id: string; event_type: string; event_at: string; payload: unknown }> = [];
    let complete = true;
    if (ids.length) {
      const { data, count, error } = await db
        .from('work_order_events')
        .select('work_order_id,event_type,event_at,payload', { count: 'exact' })
        .eq('organization_id', context.organizationId)
        .in('work_order_id', ids)
        .in('event_type', [
          'timer_play', 'timer_pause', 'timer_resume', 'timer_terminate',
          'timer_safety_paused', 'pilot_weekday_duration_calculated',
        ])
        .order('event_at', { ascending: true })
        .limit(MAX_EVENTS);
      if (error || count === null) throw error || new Error('OT evidence coverage unavailable');
      events = (data || []) as typeof events;
      complete = count === events.length && count <= MAX_EVENTS;
    }
    const result = summarizeClockReview({
      task,
      workOrders: orders || [],
      events,
      eventsComplete: complete,
    });
    return NextResponse.json({
      ...result,
      taskId: task.id,
      taskTitle: task.title,
      readOnly: true,
      source: 'motil_operational_commitments + maintenance_work_orders + work_order_events',
    }, { headers: HEADERS });
  } catch (error) {
    const code = (error as { code?: string })?.code || 'unknown';
    console.error('[motil/ot-hours-review] read failed', { code });
    return NextResponse.json({
      error: 'No se pudo completar la revisión de evidencia. Las OT siguen operando normalmente.',
    }, { status: 503, headers: HEADERS });
  }
}
