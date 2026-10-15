export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { findOtherRunningWorkOrder } from '@/lib/maintenance/other-running-work-order';
import { resolveWorkshopHeadScope, workshopSiteFromRoleTitle } from '@/lib/maintenance/workshop-site-scope';

type WorkOrderPatchPayload = {
  status?: string;
  assigned_person_id?: string | null;
  actual_duration_hours?: number | string | null;
  root_cause?: string | null;
  preventive_actions?: string | null;
  meter_reading?: number | string | null;
  meter_unit?: string | null;
  cost_center_id?: string | null;
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
      const other = await findOtherRunningWorkOrder(context, id);
      if (other) {
        return NextResponse.json({
          error: 'Primero pausa ' + (other.work_order_number || 'la otra OT') + ' e indica el motivo antes de iniciar esta orden.',
          concurrentWorkOrderId: other.id,
        }, { status: 409 });
      }
    }
    if (body.status === 'completed') {
      const { count: evidenceCount, error: evidenceError } = await context.supabase
        .from('work_order_evidence_files')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', context.organizationId)
        .eq('work_order_id', id)
        .eq('evidence_type', 'photo');
      if (evidenceError) throw evidenceError;
      if ((evidenceCount || 0) < 1) return NextResponse.json({ error: 'Agrega al menos una foto como evidencia antes de cerrar la OT.' }, { status: 409 });

      const rootCause = String(body.root_cause || '').trim();
      const preventiveActions = String(body.preventive_actions || '').trim();
      const actualHours = Number(body.actual_duration_hours);
      if (!rootCause) return NextResponse.json({ error: 'Registra la causa principal antes de completar la orden.' }, { status: 400 });
      if (!preventiveActions) return NextResponse.json({ error: 'Registra la acción preventiva antes de completar la orden.' }, { status: 400 });
      if (!Number.isFinite(actualHours) || actualHours <= 0) return NextResponse.json({ error: 'Registra las horas reales utilizadas antes de completar la orden.' }, { status: 400 });
      const costSummary = await loadCostSummary(context, id);
      const blockers: string[] = [];
      if (costSummary.pendingParts > 0) blockers.push(`${costSummary.pendingParts} repuesto${costSummary.pendingParts === 1 ? '' : 's'} pendiente${costSummary.pendingParts === 1 ? '' : 's'} de instalar o devolver`);
      if (costSummary.openLaborEntries > 0) blockers.push(`${costSummary.openLaborEntries} registro${costSummary.openLaborEntries === 1 ? '' : 's'} de trabajo aún abierto${costSummary.openLaborEntries === 1 ? '' : 's'}`);
      if (blockers.length > 0) return NextResponse.json({ error: `No se puede completar la orden: ${blockers.join(' y ')}.`, blockers, costSummary }, { status: 409 });
      const closureData: Record<string, unknown> = { root_cause: rootCause, preventive_actions: preventiveActions, actual_duration_hours: actualHours, updated_at: new Date().toISOString() };
      if (body.meter_reading !== undefined) closureData.meter_reading = body.meter_reading;
      if (body.meter_unit !== undefined) closureData.meter_unit = body.meter_unit;
      const { error: detailError } = await context.supabase.from('maintenance_work_orders').update(closureData).eq('id', id).eq('organization_id', context.organizationId);
      if (detailError) throw detailError;
      const { error: closeError } = await context.supabase.rpc('close_work_order_safely', { p_work_order_id: id });
      if (closeError) throw closeError;
      const { data: closed, error: loadError } = await context.supabase.from('maintenance_work_orders').select('*').eq('id', id).eq('organization_id', context.organizationId).single();
      if (loadError) throw loadError;
      const asset = await loadCanonicalAsset(context, closed.canonical_asset_id || null);
      return NextResponse.json({ data: mapWorkOrder(closed, asset, costSummary) });
    }

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status) updateData.status = body.status;
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
