export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { resolveWorkshopHeadScope, workshopSiteFromRoleTitle, workshopSiteFromKnownLocation } from '@/lib/maintenance/workshop-site-scope';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [schedulesResult, assetsResult, candidatesResult, hourSignalsResult, openOrdersResult, latestEmailResult, latestWhatsappResult, sourceRowsResult] = await Promise.all([
      context.supabase.from('preventive_maintenance_schedules').select('id, asset_id, canonical_asset_id, task_name, description, frequency_days, frequency_hours, last_executed_date, next_scheduled_date, estimated_duration_hours, priority, enabled, generated_work_order_id, last_generated_at, created_at').eq('organization_id', context.organizationId).order('next_scheduled_date', { ascending: true, nullsFirst: false }),
      context.supabase.from('maintenance_assets').select('id, asset_code, asset_name, asset_type, location, status, manufacturer, model, criticality').eq('organization_id', context.organizationId).order('asset_code'),
      context.supabase.from('maintenance_operation_task_candidates_v1').select('canonical_asset_id, rig_name, component_key, suggested_task, observation_count, out_of_service_count, first_observed_at, last_observed_at, latest_status, latest_observation, latest_source_file, latest_source_sheet, latest_source_row, signal_status, evidence_class').eq('organization_id', context.organizationId).order('last_observed_at', { ascending: false }),
      context.supabase.from('preventive_maintenance_hour_status_v1').select('schedule_id, canonical_asset_id, asset_code, asset_name, task_name, priority, frequency_hours, last_executed_meter, due_meter, source_meter_snapshot, latest_runtime_meter, latest_runtime_recorded_at, latest_runtime_source_type, effective_current_meter, meter_evidence_source, meter_basis_conflict, hour_status, remaining_hours, alert_due, source_reference, generated_work_order_id, enabled').eq('organization_id', context.organizationId).order('remaining_hours', { ascending: true, nullsFirst: false }),
      context.supabase.from('maintenance_work_orders').select('id, work_order_number, canonical_asset_id, title, status').eq('organization_id', context.organizationId).not('status', 'in', '(completed,cancelled)'),
      context.supabase.from('motil_email_equipment_meter_stage').select('report_date').eq('organization_id', context.organizationId).order('report_date', { ascending: false }).limit(1).maybeSingle(),
      context.supabase.from('motil_whatsapp_asset_360_latest_v1').select('operation_date').eq('organization_id', context.organizationId).order('operation_date', { ascending: false }).limit(1).maybeSingle(),
      context.supabase.from('planning_maintenance_source_rows').select('id', { count: 'exact', head: true }).eq('organization_id', context.organizationId),
    ]);

    const firstError = schedulesResult.error || assetsResult.error || candidatesResult.error || hourSignalsResult.error || openOrdersResult.error || latestEmailResult.error || latestWhatsappResult.error || sourceRowsResult.error;
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

    const latestOperationalEvidenceDate = [
      latestEmailResult.data?.report_date,
      latestWhatsappResult.data?.operation_date,
    ].filter((value): value is string => Boolean(value)).sort().at(-1) || null;

    const operationCandidates = (candidatesResult.data || [])
      .filter((candidate) => !latestOperationalEvidenceDate || String(candidate.last_observed_at || '') >= latestOperationalEvidenceDate)
      .map((candidate) => ({
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

    return NextResponse.json({ schedules, assets, summary, operationCandidates, hourSignals, intelligenceSummary, sourceEvidenceCount: sourceRowsResult.count || 0, evidenceCutoff: latestOperationalEvidenceDate });
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
    if (action === 'generate') {
      const assignedPersonId = String(body.assignedPersonId || '').trim();
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuid.test(scheduleId)) return NextResponse.json({ error: 'Plan no identificado.' }, { status: 400 });
      if (!uuid.test(assignedPersonId)) {
        return NextResponse.json({ error: 'Selecciona a la persona que ejecutará la OT.' }, { status: 400 });
      }

      // Validate schedule and assignee in the signed-in organization BEFORE the
      // existing security-definer RPC; never invoke the RPC with a foreign ID.
      const [{ data: schedule, error: scheduleError }, { data: person, error: personError }] = await Promise.all([
        context.supabase.from('preventive_maintenance_schedules')
          .select('id,organization_id,enabled,canonical_asset_id,asset_id,next_scheduled_date')
          .eq('organization_id', context.organizationId).eq('id', scheduleId).maybeSingle(),
        context.supabase.from('people')
          .select('id,full_name,role_title,profile_id')
          .eq('organization_id', context.organizationId).eq('id', assignedPersonId)
          .eq('employment_status', 'active').not('profile_id', 'is', null).maybeSingle(),
      ]);
      if (scheduleError) throw scheduleError;
      if (personError) throw personError;
      if (!schedule) return NextResponse.json({ error: 'El plan no pertenece a tu organización.' }, { status: 404 });
      if (!schedule.enabled) return NextResponse.json({ error: 'Activa el plan antes de generar una OT.' }, { status: 409 });
      if (!schedule.next_scheduled_date) {
        return NextResponse.json({ error: 'Este plan no tiene fecha de próxima intervención. Programa una OT con fecha desde Nueva OT.' }, { status: 409 });
      }
      if (!person) return NextResponse.json({ error: 'El responsable no está disponible como persona operativa activa.' }, { status: 400 });

      const workshop = await resolveWorkshopHeadScope(context);
      if (workshop.isWorkshopHead) {
        if (!workshop.personId) return NextResponse.json({ error: 'Jefatura sin identidad operativa activa.' }, { status: 403 });
        const personSite = workshopSiteFromRoleTitle(person.role_title);
        if (personSite && personSite !== workshop.site) {
          return NextResponse.json({ error: 'El ejecutor pertenece a otra mina.' }, { status: 403 });
        }
        const { data: asset, error: assetError } = await context.supabase.schema('canonical').from('assets')
          .select('location').eq('organization_id', context.organizationId)
          .eq('id', schedule.canonical_asset_id || schedule.asset_id).maybeSingle();
        if (assetError) throw assetError;
        const assetSite = workshopSiteFromKnownLocation(asset?.location);
        if (assetSite && assetSite !== workshop.site) {
          return NextResponse.json({ error: 'El equipo pertenece a otra mina.' }, { status: 403 });
        }
      }

      const { data: workOrderId, error: generateError } = await context.supabase.rpc(
        'create_work_order_from_schedule', { p_schedule_id: scheduleId, p_created_by: context.userId },
      );
      if (generateError) throw generateError;
      if (!workOrderId) throw new Error('El plan no devolvió una OT válida.');

      const { data: order, error: orderError } = await context.supabase.from('maintenance_work_orders')
        .select('id,created_by,assigned_person_id,status')
        .eq('organization_id', context.organizationId).eq('id', workOrderId).maybeSingle();
      if (orderError) throw orderError;
      if (!order) throw new Error('No se encontró la OT generada.');
      if (!order.created_by) {
        return NextResponse.json({ error: 'La OT generada no tiene creador operacional y requiere revisión de identidad.' }, { status: 409 });
      }
      if (['completed', 'closed', 'cancelled', 'canceled'].includes(String(order.status).toLowerCase())) {
        return NextResponse.json({ error: 'No se puede asignar una OT finalizada.' }, { status: 409 });
      }
      if (order.assigned_person_id && order.assigned_person_id !== person.id) {
        return NextResponse.json({ error: 'Esta OT ya está asignada a otra persona. Revísala antes de continuar.' }, { status: 409 });
      }

      // Compare-and-set: never overwrite a concurrent planner's assignment.
      if (!order.assigned_person_id) {
        const { data: updated, error: updateError } = await context.supabase.from('maintenance_work_orders')
          .update({ assigned_person_id: person.id, assigned_to_name: person.full_name, updated_at: new Date().toISOString() })
          .eq('organization_id', context.organizationId).eq('id', workOrderId)
          .is('assigned_person_id', null).select('id').maybeSingle();
        if (updateError) throw updateError;
        if (!updated) {
          const { data: current, error: currentError } = await context.supabase.from('maintenance_work_orders')
            .select('assigned_person_id').eq('organization_id', context.organizationId).eq('id', workOrderId).maybeSingle();
          if (currentError) throw currentError;
          if (current?.assigned_person_id !== person.id) {
            return NextResponse.json({ error: 'La asignación cambió mientras se generaba la OT. Actualiza el plan.' }, { status: 409 });
          }
        }
      }

      // Reuse the canonical event stream and prevent duplicate confirmation
      // events on retries after an already-created schedule-generated OT.
      const { data: existingEvent, error: eventLookupError } = await context.supabase.from('work_order_events')
        .select('id').eq('organization_id', context.organizationId).eq('work_order_id', workOrderId)
        .eq('event_type', 'schedule_executor_assigned').limit(1).maybeSingle();
      if (eventLookupError) throw eventLookupError;
      if (!existingEvent) {
        const { error: eventError } = await context.supabase.from('work_order_events').insert({
          organization_id: context.organizationId,
          work_order_id: workOrderId,
          canonical_asset_id: schedule.canonical_asset_id || schedule.asset_id,
          event_type: 'schedule_executor_assigned',
          actor_id: context.userId,
          actor_name: context.userName || null,
          source_table: 'preventive_maintenance_schedules',
          source_record_id: scheduleId,
          summary: 'Responsable asignado al generar OT desde plan preventivo',
          payload: { assigned_person_id: person.id, assigned_person_name: person.full_name },
        });
        if (eventError) throw eventError;
      }
      return NextResponse.json({ workOrderId, assignedPersonId: person.id, assignedPersonName: person.full_name });
    }
    return NextResponse.json({ error: 'Acción no reconocida.' }, { status: 400 });
  } catch (error) { const message = error instanceof Error ? error.message : 'No se pudo actualizar el plan preventivo'; return NextResponse.json({ error: message }, { status: 500 }); }
}
