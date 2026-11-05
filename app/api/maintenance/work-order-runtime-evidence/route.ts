export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { canBypassAssignedMaintenanceExecution, requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { resolveWorkshopHeadScope, workshopHeadCanAccessOrder } from '@/lib/maintenance/workshop-site-scope';

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = await request.json();
    const workOrderId = String(body?.workOrderId || '').trim();
    const workshopScope = await resolveWorkshopHeadScope(context);
    if (workshopScope.isWorkshopHead) {
      const { data: scopedOrder, error: scopeError } = await context.supabase
        .from('maintenance_work_orders').select('workshop_site,assigned_person_id')
        .eq('organization_id', context.organizationId)
        .eq('id', workOrderId).maybeSingle();
      if (scopeError) throw scopeError;
      if (!scopedOrder || !workshopHeadCanAccessOrder(workshopScope, scopedOrder)) {
        return NextResponse.json({ error: 'OT fuera de tu faena' }, { status: 403 });
      }
    }
    const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
    if (!canBypassAssignedMaintenanceExecution(context, accessLevel)) {
      const executionAccess = await requireAssignedMaintenanceExecution(context, workOrderId);
      if (!executionAccess.ok) return executionAccess.response;
    }
    const mode = String(body?.mode || '').trim();
    const notes = String(body?.notes || '').trim() || null;

    if (!workOrderId || !['meter_reading', 'not_available'].includes(mode)) {
      return NextResponse.json({ error: 'Evidencia de horómetro inválida' }, { status: 400 });
    }

    let meterHours: number | null = null;
    let recordedAt: string | null = null;
    let unavailableReason: string | null = null;

    if (mode === 'meter_reading') {
      meterHours = Number(body?.meterHours);
      recordedAt = String(body?.recordedAt || '').trim();
      if (!Number.isFinite(meterHours) || meterHours < 0 || !recordedAt || Number.isNaN(new Date(recordedAt).getTime())) {
        return NextResponse.json({ error: 'Ingresa una lectura y fecha válidas' }, { status: 400 });
      }
    } else {
      unavailableReason = String(body?.unavailableReason || '').trim();
      if (!unavailableReason) return NextResponse.json({ error: 'Indica por qué el horómetro no está disponible' }, { status: 400 });
    }

    const { data: workOrder, error: workOrderError } = await context.supabase
      .from('maintenance_work_orders')
      .select('id,organization_id,canonical_asset_id,status')
      .eq('organization_id', context.organizationId)
      .eq('id', workOrderId)
      .maybeSingle();
    if (workOrderError) throw workOrderError;
    if (!workOrder) return NextResponse.json({ error: 'OT no pertenece a la organización' }, { status: 404 });

    const recordedAtIso = recordedAt ? new Date(recordedAt).toISOString() : new Date().toISOString();
    const { data, error } = await context.supabase.rpc('record_work_order_runtime_evidence_v1', {
      p_work_order_id: workOrderId,
      p_meter_hours: meterHours,
      p_recorded_at: recordedAtIso,
      p_unavailable_reason: unavailableReason,
      p_notes: notes,
    });

    if (!error) return NextResponse.json({ evidenceId: data, mode });

    // Compatibility fallback for valid maintenance users while the production
    // RPC still carries the legacy user_roles-only authorization model.
    if (!String(error.message || '').toLowerCase().includes('sin permisos')) throw error;
    if (!workOrder.canonical_asset_id) {
      return NextResponse.json({ error: 'La OT no tiene activo canónico' }, { status: 409 });
    }
    if (String(workOrder.status || '').toLowerCase() === 'completed') {
      return NextResponse.json({ error: 'La OT ya está cerrada' }, { status: 409 });
    }

    let runtimeReadingId: string | null = null;
    if (mode === 'meter_reading') {
      const { data: reading, error: readingError } = await context.supabase
        .from('asset_runtime_readings')
        .insert({
          organization_id: context.organizationId,
          canonical_asset_id: workOrder.canonical_asset_id,
          meter_hours: meterHours,
          recorded_at: recordedAtIso,
          source_type: 'manual',
          source_reference: `work_order_close:${workOrderId}`,
          notes,
          recorded_by: context.userId,
        })
        .select('id')
        .single();
      if (readingError) throw readingError;
      runtimeReadingId = reading.id;
    }

    const evidencePayload = {
      organization_id: context.organizationId,
      work_order_id: workOrderId,
      canonical_asset_id: workOrder.canonical_asset_id,
      evidence_status: mode,
      runtime_reading_id: runtimeReadingId,
      unavailable_reason: mode === 'not_available' ? unavailableReason : null,
      notes,
      recorded_by: context.userId,
      recorded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: evidence, error: evidenceError } = await context.supabase
      .from('work_order_runtime_evidence')
      .upsert(evidencePayload, { onConflict: 'work_order_id' })
      .select('id')
      .single();

    if (evidenceError) {
      if (runtimeReadingId) {
        await context.supabase
          .from('asset_runtime_readings')
          .delete()
          .eq('organization_id', context.organizationId)
          .eq('id', runtimeReadingId);
      }
      throw evidenceError;
    }

    const { error: eventError } = await context.supabase.from('work_order_events').insert({
      organization_id: context.organizationId,
      work_order_id: workOrderId,
      canonical_asset_id: workOrder.canonical_asset_id,
      event_type: 'runtime_evidence_recorded',
      actor_id: context.userId,
      actor_name: context.userName || context.userEmail || null,
      source_table: 'work_order_runtime_evidence',
      source_record_id: evidence.id,
      summary: 'Evidencia de horómetro registrada para cierre',
      payload: {
        status: mode,
        runtime_reading_id: runtimeReadingId,
        authorization_path: 'assigned_executor_fallback',
      },
    });
    if (eventError) throw eventError;

    return NextResponse.json({ evidenceId: evidence.id, mode });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo registrar la evidencia de horómetro' }, { status: 500 });
  }
}
