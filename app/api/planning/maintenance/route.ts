export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

const CLOSED_STATUSES = new Set(['completed', 'closed', 'cancelled', 'canceled']);

type WorkOrderRow = {
  id: string;
  work_order_number: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  scheduled_date: string | null;
  planned_duration_hours: number | null;
  assigned_person_id: string | null;
  assigned_to_name: string | null;
  canonical_asset_id: string | null;
};

type WindowRow = {
  id: string;
  resource_type: 'person' | 'asset';
  resource_id: string;
  start_date: string;
  end_date: string;
  availability: 'available' | 'unavailable';
  reason: string | null;
};

function dateInWindow(date: string | null, window: WindowRow) {
  return Boolean(date && date >= window.start_date && date <= window.end_date);
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || '').trim().toLowerCase();
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const until = new Date(from);
  until.setDate(until.getDate() + 45);
  const weekUntil = new Date(from);
  weekUntil.setDate(weekUntil.getDate() + 6);
  const fromDate = from.toISOString().slice(0, 10);
  const untilDate = until.toISOString().slice(0, 10);
  const weekUntilDate = weekUntil.toISOString().slice(0, 10);

  const [workOrdersResult, preventiveResult, peopleResult, assetsResult, windowsResult, priorityResult, standardPlansResult] = await Promise.all([
    context.supabase
      .from('maintenance_work_orders')
      .select('id, work_order_number, title, status, priority, scheduled_date, planned_duration_hours, assigned_person_id, assigned_to_name, canonical_asset_id')
      .eq('organization_id', context.organizationId)
      .gte('scheduled_date', fromDate)
      .lte('scheduled_date', untilDate)
      .order('scheduled_date', { ascending: true })
      .limit(500),
    context.supabase
      .from('preventive_maintenance_schedules')
      .select('id, task_name, priority, next_scheduled_date, estimated_duration_hours, canonical_asset_id, generated_work_order_id')
      .eq('organization_id', context.organizationId)
      .eq('enabled', true)
      .gte('next_scheduled_date', fromDate)
      .lte('next_scheduled_date', untilDate)
      .order('next_scheduled_date', { ascending: true })
      .limit(500),
    context.supabase
      .from('people')
      .select('id, full_name, role_title, employment_status')
      .eq('organization_id', context.organizationId)
      .order('full_name', { ascending: true })
      .limit(1000),
    context.supabase
      .from('maintenance_assets')
      .select('id, asset_code, asset_name, asset_type, location, status, criticality')
      .eq('organization_id', context.organizationId)
      .order('asset_name', { ascending: true })
      .limit(1000),
    context.supabase
      .from('maintenance_resource_windows')
      .select('id, resource_type, resource_id, start_date, end_date, availability, reason')
      .eq('organization_id', context.organizationId)
      .lte('start_date', untilDate)
      .gte('end_date', fromDate)
      .order('start_date', { ascending: true })
      .limit(1000),
    context.supabase
      .from('planning_maintenance_priority_v1')
      .select('canonical_asset_id,asset_code,asset_name,mine_raw,meter_unit,interval_mp,current_reading_at,current_reading,remaining_meter,criticality_raw,priority,recommended_action,scheduled_date,programming_status_raw,responsible_raw,parts_status_raw,source_file,imported_at')
      .eq('organization_id', context.organizationId)
      .in('priority', ['P1 - VENCIDO','P2 - INMEDIATO','P3 - PROGRAMAR','P4 - PLANIFICAR'])
      .limit(200),
    context.supabase
      .from('maintenance_standard_job_plans')
      .select('id,plan_code,name,status,canonical_asset_id,estimated_duration_hours,proposed_by,updated_at')
      .eq('organization_id', context.organizationId)
      .in('status', ['proposed','approved'])
      .order('updated_at', { ascending: false })
      .limit(200),
  ]);

  const errors = [workOrdersResult.error, preventiveResult.error, peopleResult.error, assetsResult.error, windowsResult.error, priorityResult.error, standardPlansResult.error].filter(Boolean);
  if (errors.length > 0) {
    return NextResponse.json({ error: 'No se pudo cargar la planificación operacional.' }, { status: 500 });
  }

  const workOrders = ((workOrdersResult.data || []) as WorkOrderRow[]).filter(
    (row) => !CLOSED_STATUSES.has(normalizeStatus(row.status)),
  );
  const windows = (windowsResult.data || []) as WindowRow[];
  const conflicts: Array<{ type: string; workOrderId: string; detail: string }> = [];

  for (const workOrder of workOrders) {
    if (!workOrder.scheduled_date) continue;

    if (workOrder.assigned_person_id) {
      const overlaps = workOrders.filter(
        (candidate) =>
          candidate.id !== workOrder.id &&
          candidate.scheduled_date === workOrder.scheduled_date &&
          candidate.assigned_person_id === workOrder.assigned_person_id,
      );
      if (overlaps.length > 0) {
        conflicts.push({ type: 'person_double_booking', workOrderId: workOrder.id, detail: 'La persona tiene más de una OT programada el mismo día.' });
      }
      const blocked = windows.some(
        (window) =>
          window.resource_type === 'person' &&
          window.resource_id === workOrder.assigned_person_id &&
          window.availability === 'unavailable' &&
          dateInWindow(workOrder.scheduled_date, window),
      );
      if (blocked) conflicts.push({ type: 'person_unavailable', workOrderId: workOrder.id, detail: 'La persona figura como no disponible en esa fecha.' });
    }

    if (workOrder.canonical_asset_id) {
      const overlaps = workOrders.filter(
        (candidate) =>
          candidate.id !== workOrder.id &&
          candidate.scheduled_date === workOrder.scheduled_date &&
          candidate.canonical_asset_id === workOrder.canonical_asset_id,
      );
      if (overlaps.length > 0) {
        conflicts.push({ type: 'asset_double_booking', workOrderId: workOrder.id, detail: 'El equipo tiene más de una OT programada el mismo día.' });
      }
      const blocked = windows.some(
        (window) =>
          window.resource_type === 'asset' &&
          window.resource_id === workOrder.canonical_asset_id &&
          window.availability === 'unavailable' &&
          dateInWindow(workOrder.scheduled_date, window),
      );
      if (blocked) conflicts.push({ type: 'asset_unavailable', workOrderId: workOrder.id, detail: 'El equipo figura como no disponible en esa fecha.' });
    }
  }

  const plannedHoursByPerson = new Map<string, number>();
  for (const workOrder of workOrders) {
    if (!workOrder.assigned_person_id) continue;
    plannedHoursByPerson.set(
      workOrder.assigned_person_id,
      (plannedHoursByPerson.get(workOrder.assigned_person_id) || 0) + Number(workOrder.planned_duration_hours || 0),
    );
  }

  const priorityRank = new Map([
    ['P1 - VENCIDO', 1],
    ['P2 - INMEDIATO', 2],
    ['P3 - PROGRAMAR', 3],
    ['P4 - PLANIFICAR', 4],
  ]);
  const openByAsset = new Map<string, WorkOrderRow[]>();
  for (const workOrder of workOrders) {
    if (!workOrder.canonical_asset_id) continue;
    const rows = openByAsset.get(workOrder.canonical_asset_id) || [];
    rows.push(workOrder);
    openByAsset.set(workOrder.canonical_asset_id, rows);
  }
  const plansByAsset = new Map<string, any[]>();
  for (const plan of standardPlansResult.data || []) {
    if (!plan.canonical_asset_id) continue;
    const rows = plansByAsset.get(plan.canonical_asset_id) || [];
    rows.push(plan);
    plansByAsset.set(plan.canonical_asset_id, rows);
  }
  const weeklyDecisions = (priorityResult.data || [])
    .map((row: any) => {
      const assetId = String(row.canonical_asset_id || '');
      const assetOrders = openByAsset.get(assetId) || [];
      const scheduledOrder = assetOrders.find((item) => item.scheduled_date && item.scheduled_date >= fromDate && item.scheduled_date <= weekUntilDate);
      const standardPlan = (plansByAsset.get(assetId) || [])[0] || null;
      const partsStatus = String(row.parts_status_raw || '').trim();
      const partsPending = !partsStatus || /pendiente|faltante/i.test(partsStatus);
      return {
        canonicalAssetId: assetId || null,
        assetCode: row.asset_code || null,
        assetName: row.asset_name || row.asset_code || null,
        site: row.mine_raw || null,
        priority: row.priority || null,
        recommendedAction: row.recommended_action || null,
        criticality: row.criticality_raw || null,
        meterUnit: row.meter_unit || null,
        interval: row.interval_mp == null ? null : Number(row.interval_mp),
        currentReading: row.current_reading == null ? null : Number(row.current_reading),
        currentReadingAt: row.current_reading_at || null,
        remainingMeter: row.remaining_meter == null ? null : Number(row.remaining_meter),
        partsStatus: partsStatus || null,
        partsPending,
        sourceFile: row.source_file || null,
        sourceImportedAt: row.imported_at || null,
        scheduledWorkOrder: scheduledOrder || null,
        openWorkOrderCount: assetOrders.length,
        standardPlan: standardPlan ? {
          id: standardPlan.id,
          planCode: standardPlan.plan_code,
          name: standardPlan.name,
          status: standardPlan.status,
          estimatedDurationHours: standardPlan.estimated_duration_hours == null ? null : Number(standardPlan.estimated_duration_hours),
          proposalSource: standardPlan.proposed_by ? 'human' : 'motil',
        } : null,
        state: scheduledOrder ? 'scheduled' : partsPending ? 'blocked_materials' : standardPlan?.status === 'approved' ? 'ready' : 'review',
      };
    })
    .sort((a: any, b: any) => (priorityRank.get(a.priority) || 99) - (priorityRank.get(b.priority) || 99) || Number(a.remainingMeter || 0) - Number(b.remainingMeter || 0))
    .slice(0, 12);

  const weeklySummary = {
    total: weeklyDecisions.length,
    critical: weeklyDecisions.filter((row: any) => row.priority === 'P1 - VENCIDO' || row.priority === 'P2 - INMEDIATO').length,
    scheduled: weeklyDecisions.filter((row: any) => row.state === 'scheduled').length,
    blockedMaterials: weeklyDecisions.filter((row: any) => row.state === 'blocked_materials').length,
    ready: weeklyDecisions.filter((row: any) => row.state === 'ready').length,
    review: weeklyDecisions.filter((row: any) => row.state === 'review').length,
  };

  return NextResponse.json({
    period: { from: fromDate, until: untilDate },
    weekPeriod: { from: fromDate, until: weekUntilDate },
    workOrders,
    preventive: preventiveResult.data || [],
    people: peopleResult.data || [],
    assets: assetsResult.data || [],
    windows,
    conflicts,
    capacity: Array.from(plannedHoursByPerson.entries()).map(([personId, plannedHours]) => ({ personId, plannedHours })),
    weeklyDecisions,
    weeklySummary,
    source: 'canonical',
  });
}

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const resourceType = body?.resourceType === 'person' || body?.resourceType === 'asset' ? body.resourceType : null;
  const resourceId = typeof body?.resourceId === 'string' ? body.resourceId : null;
  const startDate = typeof body?.startDate === 'string' ? body.startDate : null;
  const endDate = typeof body?.endDate === 'string' ? body.endDate : null;
  const availability = body?.availability === 'available' ? 'available' : 'unavailable';
  const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim() : null;

  if (!resourceType || !resourceId || !startDate || !endDate || endDate < startDate) {
    return NextResponse.json({ error: 'Completa el recurso y un rango de fechas válido.' }, { status: 400 });
  }

  const sourceTable = resourceType === 'person' ? 'people' : 'maintenance_assets';
  const { data: resource, error: resourceError } = await context.supabase
    .from(sourceTable)
    .select('id')
    .eq('id', resourceId)
    .eq('organization_id', context.organizationId)
    .maybeSingle();

  if (resourceError || !resource) {
    return NextResponse.json({ error: 'El recurso no pertenece a la organización activa.' }, { status: 400 });
  }

  const { data, error } = await context.supabase
    .from('maintenance_resource_windows')
    .insert({
      organization_id: context.organizationId,
      resource_type: resourceType,
      resource_id: resourceId,
      start_date: startDate,
      end_date: endDate,
      availability,
      reason,
      created_by: context.userId,
    })
    .select('id, resource_type, resource_id, start_date, end_date, availability, reason')
    .single();

  if (error) return NextResponse.json({ error: 'No se pudo guardar la ventana de disponibilidad.' }, { status: 500 });
  return NextResponse.json({ window: data }, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const workOrderId = typeof body?.workOrderId === 'string' ? body.workOrderId : null;
  const scheduledDate = typeof body?.scheduledDate === 'string' ? body.scheduledDate : null;
  const assignedPersonId = typeof body?.assignedPersonId === 'string' && body.assignedPersonId ? body.assignedPersonId : null;

  if (!workOrderId || !scheduledDate) {
    return NextResponse.json({ error: 'Selecciona una OT y una fecha.' }, { status: 400 });
  }

  const { data: workOrder, error: workOrderError } = await context.supabase
    .from('maintenance_work_orders')
    .select('id, canonical_asset_id, status')
    .eq('id', workOrderId)
    .eq('organization_id', context.organizationId)
    .maybeSingle();

  if (workOrderError || !workOrder || CLOSED_STATUSES.has(normalizeStatus(workOrder.status))) {
    return NextResponse.json({ error: 'La OT no está disponible para programación.' }, { status: 400 });
  }

  let assignedToName: string | null = null;
  if (assignedPersonId) {
    const { data: person } = await context.supabase
      .from('people')
      .select('id, full_name')
      .eq('id', assignedPersonId)
      .eq('organization_id', context.organizationId)
      .maybeSingle();
    if (!person) return NextResponse.json({ error: 'La persona seleccionada no pertenece a la organización.' }, { status: 400 });
    assignedToName = person.full_name || null;
  }

  const conflictMessages: string[] = [];
  if (assignedPersonId) {
    const { data: personOrders } = await context.supabase
      .from('maintenance_work_orders')
      .select('id, status')
      .eq('organization_id', context.organizationId)
      .eq('assigned_person_id', assignedPersonId)
      .eq('scheduled_date', scheduledDate)
      .neq('id', workOrderId);
    if ((personOrders || []).some((row: any) => !CLOSED_STATUSES.has(normalizeStatus(row.status)))) {
      conflictMessages.push('La persona ya tiene otra OT programada ese día.');
    }
  }

  if (workOrder.canonical_asset_id) {
    const { data: assetOrders } = await context.supabase
      .from('maintenance_work_orders')
      .select('id, status')
      .eq('organization_id', context.organizationId)
      .eq('canonical_asset_id', workOrder.canonical_asset_id)
      .eq('scheduled_date', scheduledDate)
      .neq('id', workOrderId);
    if ((assetOrders || []).some((row: any) => !CLOSED_STATUSES.has(normalizeStatus(row.status)))) {
      conflictMessages.push('El equipo ya tiene otra OT programada ese día.');
    }
  }

  const resourceIds = [assignedPersonId, workOrder.canonical_asset_id].filter(Boolean) as string[];
  if (resourceIds.length > 0) {
    const { data: blockedWindows } = await context.supabase
      .from('maintenance_resource_windows')
      .select('resource_type, resource_id, reason')
      .eq('organization_id', context.organizationId)
      .eq('availability', 'unavailable')
      .in('resource_id', resourceIds)
      .lte('start_date', scheduledDate)
      .gte('end_date', scheduledDate);
    for (const window of blockedWindows || []) {
      conflictMessages.push(window.resource_type === 'person' ? 'La persona no está disponible ese día.' : 'El equipo no está disponible ese día.');
    }
  }

  if (conflictMessages.length > 0) {
    return NextResponse.json({ error: 'Conflicto de planificación.', conflicts: Array.from(new Set(conflictMessages)) }, { status: 409 });
  }

  const { data, error } = await context.supabase
    .from('maintenance_work_orders')
    .update({ scheduled_date: scheduledDate, assigned_person_id: assignedPersonId, assigned_to_name: assignedToName, updated_at: new Date().toISOString() })
    .eq('id', workOrderId)
    .eq('organization_id', context.organizationId)
    .select('id, work_order_number, scheduled_date, assigned_person_id, assigned_to_name')
    .single();

  if (error) return NextResponse.json({ error: 'No se pudo actualizar la programación.' }, { status: 500 });
  return NextResponse.json({ workOrder: data });
}
