export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { findOtherRunningWorkOrder } from '@/lib/maintenance/other-running-work-order';
import { getWorkOrderReleaseReadiness } from '@/lib/maintenance/work-order-release-readiness';
import { resolveWorkshopHeadScope, workshopSiteFromRoleTitle } from '@/lib/maintenance/workshop-site-scope';

type WorkOrderPatchPayload = {
  status?: string;
  title?: string;
  description?: string | null;
  work_type?: string;
  priority?: string;
  scheduled_date?: string | null;
  assigned_person_id?: string | null;
  actual_duration_hours?: number | string | null;
  root_cause?: string | null;
  preventive_actions?: string | null;
  meter_reading?: number | string | null;
  meter_unit?: string | null;
  cost_center_id?: string | null;
  cancel_reason?: string | null;
};

function progressFromStatus(status: string | null) {
  if (status === 'completed') return 100;
  if (status === 'in_progress') return 50;
  return 0;
}

function isExplicitDemoRecord(row: Record<string, unknown>) {
  const value = `${String(row.title || '')} ${String(row.description || '')}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /(^|\s)(demo|uat)(\s|$)/.test(value);
}

async function loadCanonicalAsset(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, assetId: string | null) {
  if (!assetId) return null;
  const { data, error } = await context.supabase.from('maintenance_canonical_assets_v1')
    .select('id, asset_code, name, asset_type, category, manufacturer, model, serial_number, license_plate')
    .eq('organization_id', context.organizationId).eq('id', assetId).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadCostSummary(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, workOrderId: string) {
  const { data, error } = await context.supabase.rpc('get_work_order_cost_summary', { p_organization_id: context.organizationId, p_work_order_id: workOrderId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { parts: Number(row?.parts_cost || 0), labor: Number(row?.labor_cost || 0), external: Number(row?.external_cost || 0), total: Number(row?.total_cost || 0), pendingParts: Number(row?.pending_parts || 0), openLaborEntries: Number(row?.open_labor_entries || 0) };
}

async function loadCostCenters(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }) {
  const { data, error } = await context.supabase.from('cost_centers').select('id,code,name,status').eq('organization_id', context.organizationId).or('status.is.null,status.eq.active').order('code');
  if (error) throw error;
  return data || [];
}

async function loadAssignees(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }) {
  const { data, error } = await context.supabase.from('people')
    .select('id,full_name,role_title,profile_id')
    .eq('organization_id', context.organizationId)
    .eq('employment_status', 'active')
    .not('profile_id', 'is', null)
    .order('full_name');
  if (error) throw error;
  return data || [];
}

async function resolveAssignee(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, personId: string) {
  const { data, error } = await context.supabase.from('people')
    .select('id,full_name,role_title,profile_id,employment_status')
    .eq('organization_id', context.organizationId)
    .eq('id', personId)
    .eq('employment_status', 'active')
    .not('profile_id', 'is', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('El responsable seleccionado no es una persona operativa activa y vinculada.');
  return data;
}

async function loadCloseReadiness(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, workOrderId: string) {
  const { data, error } = await context.supabase.from('work_order_close_readiness_v2')
    .select('ready_to_close,next_action,missing_asset,missing_root_cause,missing_preventive_actions,missing_actual_hours,missing_runtime_evidence,runtime_evidence_status,runtime_unavailable_reason,open_procurement_orders,pending_parts,unmet_material_requirements,pending_external_services,open_labor_entries,standard_plan_steps_pending')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', workOrderId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function validateCostCenter(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, costCenterId: string) {
  const { data, error } = await context.supabase.from('cost_centers').select('id,code,name,status').eq('organization_id', context.organizationId).eq('id', costCenterId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Centro de costo no válido para esta organización');
  if (data.status && data.status !== 'active') throw new Error('El centro de costo seleccionado no está activo');
  return data;
}

async function hasOpenOperationalOrder(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, workOrderId: string) {
  const { count, error } = await context.supabase.from('procurement_operational_orders').select('id', { head: true, count: 'exact' })
    .eq('organization_id', context.organizationId).eq('work_order_id', workOrderId).in('status', ['issued', 'partially_received']);
  if (error) throw error;
  return (count || 0) > 0;
}

function mapWorkOrder(row: Record<string, unknown>, asset: Record<string, unknown> | null, costSummary?: Awaited<ReturnType<typeof loadCostSummary>>) {
  return {
    ...row,
    asset_id: row.canonical_asset_id || null,
    asset_name: asset?.name || null,
    asset_code: asset?.asset_code || null,
    asset_type: asset?.asset_type || null,
    asset_category: asset?.category || null,
    asset_manufacturer: asset?.manufacturer || null,
    asset_model: asset?.model || null,
    asset_serial_number: asset?.serial_number || null,
    asset_license_plate: asset?.license_plate || null,
    progress_percentage: progressFromStatus(String(row.status || '')),
    cost_summary: costSummary || null,
    record_scope: row.created_by ? 'operational' : 'historical',
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;
  try {
    const { data, error } = await context.supabase.from('maintenance_work_orders').select('*').eq('id', id).eq('organization_id', context.organizationId).maybeSingle();
    if (error) throw error;
    if (!data || isExplicitDemoRecord(data)) return NextResponse.json({ error: 'No se encontró la orden de trabajo' }, { status: 404 });

    const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
    const canReadModule = accessLevel === 'ED' || accessLevel === 'LEC';
    const assignedExecution = await requireAssignedMaintenanceExecution(context, id);
    const canExecuteAssigned = assignedExecution.ok && Boolean(data.created_by);

    if (!canReadModule && !canExecuteAssigned) {
      return assignedExecution.ok
        ? NextResponse.json({ error: 'No tienes acceso a esta orden de trabajo' }, { status: 403 })
        : assignedExecution.response;
    }

    const [asset, costSummary, closeReadiness] = await Promise.all([
      loadCanonicalAsset(context, data.canonical_asset_id || null),
      loadCostSummary(context, id),
      loadCloseReadiness(context, id),
    ]);
    const [costCenters, assignees] = canReadModule
      ? await Promise.all([loadCostCenters(context), loadAssignees(context)])
      : [[], []];
    const recordScope = data.created_by ? 'operational' : 'historical';
    return NextResponse.json({
      data: mapWorkOrder(data, asset, costSummary),
      costCenters,
      assignees,
      closeReadiness,
      canEdit: recordScope === 'operational' && (accessLevel === 'ED' || canExecuteAssigned),
      assignedExecution: canExecuteAssigned,
      record_scope: recordScope,
      canonical: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la orden de trabajo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;
  try {
    const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
    const hasModuleWrite = accessLevel === 'ED';
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const executionAccess = await requireAssignedMaintenanceExecution(context, id);
    if (!hasModuleWrite && !executionAccess.ok) return executionAccess.response;

    const body = (await request.json()) as WorkOrderPatchPayload;
    const { data: currentOrderState, error: currentOrderStateError } = await context.supabase
      .from('maintenance_work_orders')
      .select('status,work_type,priority')
      .eq('id', id)
      .eq('organization_id', context.organizationId)
      .single();
    if (currentOrderStateError) throw currentOrderStateError;
    const currentStatus = String(currentOrderState?.status || '').toLowerCase();
    const currentWorkType = String(currentOrderState?.work_type || '').toLowerCase();
    if (['completed', 'closed', 'cancelled', 'canceled'].includes(currentStatus)) {
      return NextResponse.json({ error: 'La OT ya está cerrada o anulada y no se puede modificar.' }, { status: 409 });
    }
    if (currentWorkType === 'emergency') {
      if (body.work_type !== undefined && String(body.work_type || '').toLowerCase() !== 'emergency') {
        return NextResponse.json({ error: 'Una OTe no puede convertirse en una OT normal.' }, { status: 409 });
      }
      if (body.priority !== undefined && String(body.priority || '').toLowerCase() !== 'critical') {
        return NextResponse.json({ error: 'Una OTe conserva prioridad crítica.' }, { status: 409 });
      }
    }
    if (currentStatus === 'in_progress' && hasModuleWrite) {
      const structuralFields = ['work_type', 'priority', 'scheduled_date', 'assigned_person_id', 'cost_center_id']
        .filter((key) => (body as Record<string, unknown>)[key] !== undefined);
      if (structuralFields.length > 0) {
        return NextResponse.json({ error: 'Una OT en curso permite corregir el nombre o la descripción, pero no cambiar su planificación.' }, { status: 409 });
      }
    }
    const workshopScope = await resolveWorkshopHeadScope(context);
    if (!hasModuleWrite) {
      const mutationKeys = Object.entries(body)
        .filter(([, value]) => value !== undefined)
        .map(([key]) => key);
      const executionFields = new Set(['root_cause', 'preventive_actions', 'actual_duration_hours', 'meter_reading', 'meter_unit']);
      const isStartOnly = mutationKeys.length === 1 && mutationKeys[0] === 'status' && body.status === 'in_progress';
      const isExecutionEvidenceOnly = mutationKeys.length > 0 && mutationKeys.every((key) => executionFields.has(key));
      if (!isStartOnly && !isExecutionEvidenceOnly) {
        return NextResponse.json(
          { error: 'El ejecutor asignado sólo puede iniciar su OT y registrar evidencia de su propia ejecución.' },
          { status: 403 },
        );
      }
    }
    if (body.status === 'in_progress') {
      const releaseReadiness = await getWorkOrderReleaseReadiness(context.supabase, context.organizationId, id);
      if (!releaseReadiness.ready) {
        return NextResponse.json(
          {
            error: 'La OT no está preparada para ejecución.',
            blockers: releaseReadiness.blockers,
            emergencyBypass: releaseReadiness.emergencyBypass,
          },
          { status: 409 },
        );
      }

      const other = await findOtherRunningWorkOrder(context, id);
      if (other) {
        return NextResponse.json({
          error: 'Primero pausa ' + (other.work_order_number || 'la otra OT') + ' e indica el motivo antes de iniciar esta orden.',
          concurrentWorkOrderId: other.id,
        }, { status: 409 });
      }
    }
    if (body.status === 'cancelled' || body.status === 'canceled') {
      if (!hasModuleWrite) {
        return NextResponse.json({ error: 'Solo un usuario autorizado de mantenimiento puede anular una OT.' }, { status: 403 });
      }
      const cancelReason = String(body.cancel_reason || '').trim();
      if (!cancelReason) {
        return NextResponse.json({ error: 'Indica el motivo de anulación de la OT.' }, { status: 400 });
      }
      const { error: cancelError } = await context.supabase.rpc('cancel_work_order_safely_v1', {
        p_organization_id: context.organizationId,
        p_work_order_id: id,
        p_actor_id: context.userId,
        p_actor_name: context.userName || context.userEmail || null,
        p_reason: cancelReason,
      });
      if (cancelError) {
        const status = cancelError.code === '22023' ? 400
          : cancelError.code === '55000' ? 409
            : cancelError.code === 'P0002' ? 404
              : 500;
        return NextResponse.json({ error: cancelError.message || 'No se pudo anular la orden de trabajo' }, { status });
      }
      const { data: cancelled, error: loadCancelledError } = await context.supabase
        .from('maintenance_work_orders')
        .select('*')
        .eq('id', id)
        .eq('organization_id', context.organizationId)
        .single();
      if (loadCancelledError) throw loadCancelledError;
      const [asset, costSummary] = await Promise.all([
        loadCanonicalAsset(context, cancelled.canonical_asset_id || null),
        loadCostSummary(context, id),
      ]);
      return NextResponse.json({ data: mapWorkOrder(cancelled, asset, costSummary) });
    }

    if (body.status === 'completed') {
      // Every OT closure must use the same assigned-executor, timer, fluid and evidence transaction.
      // Do not maintain a second completion path with weaker rules.
      if (!executionAccess.ok) return executionAccess.response;

      const normalizedHours = Number(body.actual_duration_hours);
      const requestedHours = Number.isFinite(normalizedHours) && normalizedHours > 0 ? normalizedHours : null;
      const { error: closeError } = await context.supabase.rpc('close_work_order_with_timer_v3', {
        p_organization_id: context.organizationId,
        p_work_order_id: id,
        p_actor_id: context.userId,
        p_actor_name: context.userName || context.userEmail || null,
        p_actual_duration_hours: requestedHours,
        p_root_cause: body.root_cause === undefined ? null : body.root_cause,
        p_preventive_actions: body.preventive_actions === undefined ? null : body.preventive_actions,
      });
      if (closeError) {
        const status = ['55000', 'P0001'].includes(String(closeError.code || '')) ? 409
          : closeError.code === '42501' ? 403
            : closeError.code === 'P0002' ? 404
              : 500;
        return NextResponse.json({ error: closeError.message || 'No se pudo cerrar la orden de trabajo' }, { status });
      }

      const { data: closed, error: loadError } = await context.supabase
        .from('maintenance_work_orders')
        .select('*')
        .eq('id', id)
        .eq('organization_id', context.organizationId)
        .single();
      if (loadError) throw loadError;
      const [asset, costSummary] = await Promise.all([
        loadCanonicalAsset(context, closed.canonical_asset_id || null),
        loadCostSummary(context, id),
      ]);
      return NextResponse.json({ data: mapWorkOrder(closed, asset, costSummary) });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) updateData.status = body.status;
    if (hasModuleWrite && body.title !== undefined) {
      const title = String(body.title || '').trim();
      if (!title) return NextResponse.json({ error: 'El trabajo debe tener un nombre.' }, { status: 400 });
      updateData.title = title;
    }
    if (hasModuleWrite && body.description !== undefined) updateData.description = body.description ? String(body.description).trim() : null;
    if (hasModuleWrite && body.work_type !== undefined) updateData.work_type = String(body.work_type || '').trim() || null;
    if (hasModuleWrite && body.priority !== undefined) updateData.priority = String(body.priority || '').trim() || null;
    if (hasModuleWrite && body.scheduled_date !== undefined) updateData.scheduled_date = body.scheduled_date || null;
    if (body.assigned_person_id !== undefined) {
      if (body.assigned_person_id) {
        const assignee = await resolveAssignee(context, body.assigned_person_id);
        const assigneeSite = workshopSiteFromRoleTitle(assignee.role_title);
        if (workshopScope.isWorkshopHead && assigneeSite && assigneeSite !== workshopScope.site) {
          return NextResponse.json({ error: 'No puedes asignar una OT a otra mina.' }, { status: 403 });
        }
        updateData.assigned_person_id = assignee.id;
        updateData.assigned_to_name = assignee.full_name;
      } else {
        updateData.assigned_person_id = null;
        updateData.assigned_to_name = null;
      }
    }
    if (body.actual_duration_hours !== undefined) updateData.actual_duration_hours = body.actual_duration_hours;
    if (body.root_cause !== undefined) updateData.root_cause = body.root_cause;
    if (body.preventive_actions !== undefined) updateData.preventive_actions = body.preventive_actions;
    if (body.meter_reading !== undefined) updateData.meter_reading = body.meter_reading;
    if (body.meter_unit !== undefined) updateData.meter_unit = body.meter_unit;
    if (body.cost_center_id !== undefined) {
      const { data: currentOrder, error: currentOrderError } = await context.supabase.from('maintenance_work_orders').select('cost_center_id').eq('id', id).eq('organization_id', context.organizationId).maybeSingle();
      if (currentOrderError) throw currentOrderError;
      if (!currentOrder) return NextResponse.json({ error: 'No se encontró la orden de trabajo' }, { status: 404 });
      const nextCostCenterId = body.cost_center_id || null;
      if (nextCostCenterId !== (currentOrder.cost_center_id || null) && await hasOpenOperationalOrder(context, id)) return NextResponse.json({ error: 'No se puede cambiar la imputación mientras exista una OC emitida o parcialmente recibida para esta OT.' }, { status: 409 });
      if (nextCostCenterId) await validateCostCenter(context, nextCostCenterId);
      updateData.cost_center_id = nextCostCenterId;
    }

    const { data, error } = await context.supabase.from('maintenance_work_orders').update(updateData).eq('id', id).eq('organization_id', context.organizationId).select('*').single();
    if (error) throw error;
    const changedFields = ['title','description','work_type','priority','scheduled_date','status']
      .filter((key) => updateData[key] !== undefined);
    if (changedFields.length > 0) {
      const { error: eventError } = await context.supabase.from('work_order_events').insert({
        organization_id: context.organizationId,
        work_order_id: id,
        canonical_asset_id: data.canonical_asset_id || null,
        event_type: body.status === 'cancelled' ? 'work_order_cancelled' : 'work_order_updated',
        event_at: new Date().toISOString(),
        actor_id: context.authUserId,
        source_table: 'maintenance_work_orders',
        source_record_id: id,
        summary: body.status === 'cancelled' ? 'Orden anulada por usuario autorizado' : 'Orden actualizada por usuario autorizado',
        payload: { changed_fields: changedFields },
      });
      if (eventError) throw eventError;
    }
    const [asset, costSummary] = await Promise.all([loadCanonicalAsset(context, data.canonical_asset_id || null), loadCostSummary(context, id)]);
    return NextResponse.json({ data: mapWorkOrder(data, asset, costSummary) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar la orden de trabajo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;
  try {
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const { count, error: countError } = await context.supabase.from('work_order_events').select('*', { head: true, count: 'exact' }).eq('organization_id', context.organizationId).eq('work_order_id', id);
    if (countError) throw countError;
    if ((count || 0) > 1) return NextResponse.json({ error: 'La orden ya tiene historial y no puede eliminarse. Cancélala en su lugar.' }, { status: 409 });
    const { error } = await context.supabase.from('maintenance_work_orders').delete().eq('id', id).eq('organization_id', context.organizationId);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo eliminar la orden de trabajo';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
