export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [schedulesResult, assetsResult, candidatesResult, hourSignalsResult, openOrdersResult] = await Promise.all([
      context.supabase.from('preventive_maintenance_schedules').select('id, asset_id, canonical_asset_id, task_name, description, frequency_days, frequency_hours, last_executed_date, next_scheduled_date, estimated_duration_hours, priority, enabled, generated_work_order_id, last_generated_at, created_at').eq('organization_id', context.organizationId).order('next_scheduled_date', { ascending: true, nullsFirst: false }),
      context.supabase.from('maintenance_assets').select('id, asset_code, asset_name, asset_type, location, status, manufacturer, model, criticality').eq('organization_id', context.organizationId).order('asset_code'),
      context.supabase.from('maintenance_operation_task_candidates_v1').select('canonical_asset_id, rig_name, component_key, suggested_task, observation_count, out_of_service_count, first_observed_at, last_observed_at, latest_status, latest_observation, latest_source_file, latest_source_sheet, latest_source_row, signal_status, evidence_class').eq('organization_id', context.organizationId).order('last_observed_at', { ascending: false }),
      context.supabase.from('preventive_maintenance_hour_status_v1').select('schedule_id, canonical_asset_id, asset_code, asset_name, task_name, priority, frequency_hours, last_executed_meter, due_meter, source_meter_snapshot, latest_runtime_meter, latest_runtime_recorded_at, latest_runtime_source_type, effective_current_meter, meter_evidence_source, meter_basis_conflict, hour_status, remaining_hours, alert_due, source_reference, generated_work_order_id, enabled').eq('organization_id', context.organizationId).order('remaining_hours', { ascending: true, nullsFirst: false }),
      context.supabase.from('maintenance_work_orders').select('id, work_order_number, canonical_asset_id, title, status').eq('organization_id', context.organizationId).not('status', 'in', '(completed,cancelled)'),
    ]);

    const firstError = schedulesResult.error || assetsResult.error || candidatesResult.error || hourSignalsResult.error || openOrdersResult.error;
    if (firstError) throw firstError;

    const assets = assetsResult.data || [];
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const schedules = (schedulesResult.data || []).map((schedule) => ({ ...schedule, asset: assetsById.get(schedule.asset_id) || null }));

    const openOrdersByAsset = new Map<string, Array<{ id: string; work_order_number: string; title: string; status: string }>>();
    for (const order of openOrdersResult.data || []) {
      if (!order.canonical_asset_id) continue;
      const current = openOrdersByAsset.get(order.canonical_asset_id) || [];
      current.push({ id: order.id, work_order_number: order.work_order_number, title: order.title, status: order.status });
      openOrdersByAsset.set(order.canonical_asset_id, current);
    }

    const operationCandidates = (candidatesResult.data || []).map((candidate) => ({
      ...candidate,
      open_work_orders: openOrdersByAsset.get(candidate.canonical_asset_id) || [],
      promotion_state: 'pending_human_review',
    }));

    const hourSignals = (hourSignalsResult.data || []).map((signal) => {
      const effective = signal.effective_current_meter == null ? null : Number(signal.effective_current_meter);
      const lastExecuted = signal.last_executed_meter == null ? null : Number(signal.last_executed_meter);
      const meterBasisWarning = effective != null && lastExecuted != null && effective < lastExecuted;
      return {
        ...signal,
        meter_basis_warning: meterBasisWarning,
        evidence_quality: signal.meter_evidence_source === 'runtime_reading' && !meterBasisWarning ? 'observed_runtime' : meterBasisWarning ? 'needs_reconciliation' : 'source_snapshot',
      };
    });

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const inThirtyDays = new Date(today); inThirtyDays.setDate(inThirtyDays.getDate() + 30);
    const summary = schedules.reduce((totals, schedule) => {
      totals.total += 1;
      if (!schedule.enabled) totals.disabled += 1;
      if (schedule.generated_work_order_id) totals.generated += 1;
      if (schedule.next_scheduled_date) {
        const due = new Date(`${schedule.next_scheduled_date}T00:00:00`);
        if (due < today) totals.overdue += 1;
        else if (due <= inThirtyDays) totals.dueSoon += 1;
      }
      return totals;
    }, { total: 0, overdue: 0, dueSoon: 0, disabled: 0, generated: 0 });

    const intelligenceSummary = {
      operationCandidates: operationCandidates.length,
      attentionCandidates: operationCandidates.filter((item) => item.signal_status === 'attention').length,
      hourAlerts: hourSignals.filter((item) => item.alert_due && !item.meter_basis_warning).length,
      hourEvidenceWarnings: hourSignals.filter((item) => item.meter_basis_warning).length,
    };

    return NextResponse.json({ schedules, assets, summary, operationCandidates, hourSignals, intelligenceSummary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la planificación preventiva';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request); if (!context.ok) return context.response;
  try {
    const body = await request.json();
    const assetId = String(body.assetId || ''); const taskName = String(body.taskName || '').trim(); const nextScheduledDate = String(body.nextScheduledDate || '');
    const frequencyDays = body.frequencyDays ? Number(body.frequencyDays) : null; const frequencyHours = body.frequencyHours ? Number(body.frequencyHours) : null;
    if (!assetId || !taskName || !nextScheduledDate) return NextResponse.json({ error: 'Equipo, tarea y próxima fecha son obligatorios.' }, { status: 400 });
    if (!frequencyDays && !frequencyHours) return NextResponse.json({ error: 'Define una frecuencia por días o por horas.' }, { status: 400 });
    const { data: asset, error: assetError } = await context.supabase.from('maintenance_assets').select('id').eq('organization_id', context.organizationId).eq('id', assetId).maybeSingle();
    if (assetError) throw assetError; if (!asset) return NextResponse.json({ error: 'Equipo no encontrado.' }, { status: 404 });
    const { data, error } = await context.supabase.from('preventive_maintenance_schedules').insert({ organization_id: context.organizationId, asset_id: asset.id, canonical_asset_id: asset.id, task_name: taskName, description: String(body.description || '').trim() || null, frequency_days: frequencyDays, frequency_hours: frequencyHours, next_scheduled_date: nextScheduledDate, estimated_duration_hours: body.estimatedDurationHours ? Number(body.estimatedDurationHours) : null, priority: String(body.priority || 'medium'), enabled: true }).select('id').single();
    if (error) throw error; return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) { const message = error instanceof Error ? error.message : 'No se pudo crear el plan preventivo'; return NextResponse.json({ error: message }, { status: 500 }); }
}

export async function PATCH(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request); if (!context.ok) return context.response;
  try {
    const body = await request.json(); const scheduleId = String(body.scheduleId || ''); const action = String(body.action || '');
    if (!scheduleId) return NextResponse.json({ error: 'Plan no identificado.' }, { status: 400 });
    if (action === 'toggle') {
      const { data: schedule, error: readError } = await context.supabase.from('preventive_maintenance_schedules').select('enabled').eq('organization_id', context.organizationId).eq('id', scheduleId).maybeSingle();
      if (readError) throw readError; if (!schedule) return NextResponse.json({ error: 'Plan no encontrado.' }, { status: 404 });
      const { error } = await context.supabase.from('preventive_maintenance_schedules').update({ enabled: !schedule.enabled, updated_at: new Date().toISOString() }).eq('organization_id', context.organizationId).eq('id', scheduleId);
      if (error) throw error; return NextResponse.json({ ok: true });
    }
    if (action === 'generate') { const { data, error } = await context.supabase.rpc('create_work_order_from_schedule', { p_schedule_id: scheduleId, p_created_by: context.userId }); if (error) throw error; return NextResponse.json({ workOrderId: data }); }
    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (error) { const message = error instanceof Error ? error.message : 'No se pudo actualizar el plan preventivo'; return NextResponse.json({ error: message }, { status: 500 }); }
}
