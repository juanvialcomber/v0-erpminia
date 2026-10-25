export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getMaintenanceWorkOrderCreationCapability } from '@/lib/maintenance/work-order-create-access';
import { resolveMaintenanceViewerMode } from '@/lib/maintenance/viewer-mode';
import { resolveWorkshopHeadScope, workshopHeadOrderFilter, workshopSiteFromKnownLocation, workshopSiteFromRoleTitle } from '@/lib/maintenance/workshop-site-scope';
import { applyStandardJobPlanToWorkOrder } from '@/lib/maintenance/apply-standard-job-plan';

type WorkOrderRow = {
  id: string;
  work_order_number: string;
  asset_id: string | null;
  canonical_asset_id: string | null;
  assigned_person_id: string | null;
  title: string | null;
  description: string | null;
  work_type: string | null;
  status: string | null;
  priority: string | null;
  assigned_to_name: string | null;
  cost_center_id: string | null;
  planned_duration_hours: number | string | null;
  actual_duration_hours: number | string | null;
  scheduled_date: string | null;
  completion_date: string | null;
  root_cause: string | null;
  preventive_actions: string | null;
  meter_reading: number | string | null;
  meter_unit: string | null;
  creation_request_id: string | null;
  created_by: string | null;
  created_at: string;
};

type CanonicalAssetRow = { id: string; asset_code: string; name: string; asset_type: string | null; is_active: boolean };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SupervisorReviewRow = {
  work_order_id: string;
  status: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
};

type WorkOrderPayload = {
  canonicalAssetId?: string;
  canonical_asset_id?: string;
  reviewId?: string | null;
  review_id?: string | null;
  assignedPersonId?: string | null;
  assigned_person_id?: string | null;
  title?: string;
  description?: string | null;
  requestedMaterials?: string | null;
  requested_materials?: string | null;
  materials?: Array<{
    canonicalProductId?: string;
    canonical_product_id?: string;
    quantityRequired?: number | string;
    quantity_required?: number | string;
  }>;
  workType?: string;
  work_type?: string;
  priority?: string;
  scheduledDate?: string | null;
  scheduled_date?: string | null;
  plannedDurationHours?: number | string;
  planned_duration_hours?: number | string;
  assignedToName?: string | null;
  assigned_to_name?: string | null;
  meterReading?: number | string | null;
  meter_reading?: number | string | null;
  meterUnit?: string | null;
  meter_unit?: string | null;
  costCenterId?: string | null;
  cost_center_id?: string | null;
  standardPlanId?: string | null;
  standard_plan_id?: string | null;
};

function isExplicitDemoRecord(row: WorkOrderRow) {
  const value = `${row.title || ''} ${row.description || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  return /(^|\s)(demo|uat)(\s|$)/.test(value);
}

function mapWorkOrder(row: WorkOrderRow, asset?: CanonicalAssetRow | null, review?: SupervisorReviewRow | null) {
  return {
    ...row,
    asset_id: row.canonical_asset_id,
    asset_name: asset?.name || null,
    asset_code: asset?.asset_code || null,
    asset_type: asset?.asset_type || null,
    record_scope: row.created_by ? 'operational' : 'historical',
    progress_percentage: row.status === 'completed' ? 100 : row.status === 'in_progress' ? 50 : 0,
    approval_status: row.status === 'completed' ? (review?.status || 'pending') : null,
    reviewed_by_name: review?.reviewed_by_name || null,
    reviewed_at: review?.reviewed_at || null,
  };
}

async function loadAssetMap(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, rows: WorkOrderRow[]) {
  const ids = [...new Set(rows.map((row) => row.canonical_asset_id).filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map<string, CanonicalAssetRow>();
  const { data, error } = await context.supabase
    .from('maintenance_canonical_assets_v1')
    .select('id,asset_code,name,asset_type,is_active')
    .eq('organization_id', context.organizationId)
    .in('id', ids);
  if (error) throw error;
  return new Map(((data || []) as CanonicalAssetRow[]).map((asset) => [asset.id, asset]));
}

async function loadReviewMap(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, rows: WorkOrderRow[]) {
  const ids = rows
    .filter((row) => row.status === 'completed')
    .map((row) => row.id);
  if (ids.length === 0) return new Map<string, SupervisorReviewRow>();

  const { data, error } = await context.supabase
    .from('work_order_supervisor_reviews')
    .select('work_order_id,status,reviewed_by_name,reviewed_at')
    .eq('organization_id', context.organizationId)
    .in('work_order_id', ids);
  if (error) throw error;

  return new Map(((data || []) as SupervisorReviewRow[]).map((review) => [review.work_order_id, review]));
}

async function resolveExecutionPersonId(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }) {
  const { data: profile, error: profileError } = await context.supabase
    .from('profiles')
    .select('cargo_id')
    .eq('id', context.userId)
    .eq('organization_id', context.organizationId)
    .maybeSingle();
  if (profileError) throw profileError;

  let cargoName: string | null = null;
  if (profile?.cargo_id) {
    const { data: cargo, error: cargoError } = await context.supabase
      .from('cargos')
      .select('name')
      .eq('id', profile.cargo_id)
      .maybeSingle();
    if (cargoError) throw cargoError;
    cargoName = cargo?.name || null;
  }

  if (resolveMaintenanceViewerMode(cargoName) !== 'execution') {
    return { execution: false, personId: null as string | null };
  }

  const { data: person, error: personError } = await context.supabase
    .from('people')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('profile_id', context.userId)
    .maybeSingle();
  if (personError) throw personError;

  return { execution: true, personId: person?.id || null };
}

async function recordRequestedMaterials(
  context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true },
  workOrder: WorkOrderRow,
  requestedMaterials: string | null,
) {
  const note = requestedMaterials?.trim();
  if (!note) return;

  const { data: existingEvent, error: existingEventError } = await context.supabase
    .from('work_order_events')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', workOrder.id)
    .eq('event_type', 'material_request_recorded')
    .eq('source_record_id', workOrder.id)
    .limit(1)
    .maybeSingle();
  if (existingEventError) throw existingEventError;
  if (existingEvent) return;

  const { error } = await context.supabase.from('work_order_events').insert({
    organization_id: context.organizationId,
    work_order_id: workOrder.id,
    canonical_asset_id: workOrder.canonical_asset_id,
    event_type: 'material_request_recorded',
    event_at: new Date().toISOString(),
    actor_id: context.authUserId,
    source_table: 'maintenance_work_orders',
    source_record_id: workOrder.id,
    summary: 'Pedido de materiales registrado sin bloqueo de stock durante puesta en marcha',
    payload: {
      requested_materials_note: note,
      stock_policy: 'informational_non_blocking',
      quantity_status: 'operator_provided_or_unspecified',
      sku_status: 'operator_provided_or_unspecified',
    },
  });
  if (error) throw error;
}


async function applyRequestedStandardPlan(
  context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true },
  workOrderId: string,
  standardPlanId: string | null,
) {
  if (!standardPlanId) return null;
  return applyStandardJobPlanToWorkOrder({
    supabase: context.supabase,
    organizationId: context.organizationId,
    userId: context.userId,
    planId: standardPlanId,
    workOrderId,
  });
}

async function recordStructuredMaterials(
  context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true },
  workOrderId: string,
  materials: WorkOrderPayload['materials'],
) {
  const rows = Array.isArray(materials) ? materials : [];
  if (rows.length === 0) return;

  const normalized = rows.map((item) => ({
    canonicalProductId: item.canonicalProductId || item.canonical_product_id || '',
    quantityRequired: Number(item.quantityRequired ?? item.quantity_required ?? 0),
    requiredDate: null,
    notes: null,
  }));

  if (normalized.some((item) => !item.canonicalProductId || !Number.isFinite(item.quantityRequired) || item.quantityRequired <= 0)) {
    throw new Error('Los insumos seleccionados tienen datos inválidos');
  }

  const { error } = await context.supabase.rpc('replace_work_order_material_requirements_v1', {
    p_organization_id: context.organizationId,
    p_work_order_id: workOrderId,
    p_materials: normalized,
  });
  if (error) throw error;
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  try {
    const executionScope = await resolveExecutionPersonId(context);
    const workshopScope = await resolveWorkshopHeadScope(context);
    const executionWithoutPerson = executionScope.execution && !(workshopScope.isWorkshopHead ? workshopScope.personId : executionScope.personId);
    if (executionWithoutPerson) {
      return NextResponse.json({ workOrders: [], canonical: true, assignedOnly: true });
    }

    const status = request.nextUrl.searchParams.get('status')?.trim();
    const priority = request.nextUrl.searchParams.get('priority')?.trim();
    const scope = request.nextUrl.searchParams.get('scope')?.trim();
    const limit = Number(request.nextUrl.searchParams.get('limit') || '0');
    let query = context.supabase.from('maintenance_work_orders').select('*').eq('organization_id', context.organizationId).order('created_at', { ascending: false });
    if (workshopScope.isWorkshopHead) {
      query = query.or(workshopHeadOrderFilter(workshopScope));
    } else if (executionScope.execution && executionScope.personId) {
      query = query.eq('assigned_person_id', executionScope.personId);
    }
    if (status) query = query.eq('status', status);
    if (priority) query = query.eq('priority', priority);
    if (scope === 'operational') query = query.not('created_by', 'is', null);
    if (scope === 'historical') query = query.is('created_by', null);
    if (Number.isFinite(limit) && limit > 0) query = query.limit(limit);
    const { data, error } = await query;
    if (error) throw error;
    const rows = ((data || []) as WorkOrderRow[]).filter((row) => !isExplicitDemoRecord(row));
    const [assetMap, reviewMap] = await Promise.all([
      loadAssetMap(context, rows),
      loadReviewMap(context, rows),
    ]);
    return NextResponse.json({
      workOrders: rows.map((row) => mapWorkOrder(
        row,
        row.canonical_asset_id ? assetMap.get(row.canonical_asset_id) : null,
        reviewMap.get(row.id) || null,
      )),
      canonical: true,
      assignedOnly: executionScope.execution && !workshopScope.isWorkshopHead,
      workshopSite: workshopScope.isWorkshopHead ? workshopScope.site : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron obtener las órdenes de trabajo';
    console.error('[maintenance/work-orders:get]', error);
    return NextResponse.json({ workOrders: [], error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  try {
    const body = (await request.json()) as WorkOrderPayload;
    const canonicalAssetId = body.canonicalAssetId || body.canonical_asset_id || null;
    const workType = body.workType || body.work_type || 'corrective';
    const isGeneralWork = workType === 'general';
    const reviewId = body.reviewId || body.review_id || null;
    const assignedPersonId = body.assignedPersonId || body.assigned_person_id || null;
    const requestedMaterials = body.requestedMaterials || body.requested_materials || null;
    const materials = body.materials || [];
    const standardPlanId = body.standardPlanId || body.standard_plan_id || null;
    const creationRequestId = request.headers.get('idempotency-key')?.trim() || null;
    if (!canonicalAssetId && !isGeneralWork) return NextResponse.json({ error: 'Selecciona un equipo o elige trabajo general del taller' }, { status: 400 });
    if (reviewId && !canonicalAssetId) return NextResponse.json({ error: 'Una revisión de equipo debe conservar su equipo asociado' }, { status: 400 });
    if (!body.title?.trim()) return NextResponse.json({ error: 'Describe brevemente el trabajo a realizar' }, { status: 400 });
    if (!context.authUserId) {
      return NextResponse.json(
        { error: 'La identidad autenticada no está vinculada al perfil operacional' },
        { status: 409 }
      );
    }

    const creationCapability = await getMaintenanceWorkOrderCreationCapability(context);
    const workshopScope = await resolveWorkshopHeadScope(context);
    if (workshopScope.isWorkshopHead && !workshopScope.personId) {
      return NextResponse.json({ error: 'Tu cargo debe estar vinculado a una persona activa para crear OT.' }, { status: 403 });
    }
    if (!creationCapability.canCreate) {
      return NextResponse.json(
        { error: 'Tu cargo no tiene autorización para crear órdenes de trabajo de mantenimiento.' },
        { status: 403 }
      );
    }

    if (!assignedPersonId) {
      return NextResponse.json({ error: 'Selecciona primero al responsable de la OT' }, { status: 400 });
    }

    const { data: assignedPerson, error: assignedPersonError } = await context.supabase
      .from('people')
      .select('id,full_name,role_title')
      .eq('organization_id', context.organizationId)
      .eq('id', assignedPersonId)
      .eq('employment_status', 'active')
      .not('profile_id', 'is', null)
      .maybeSingle();
    if (assignedPersonError) throw assignedPersonError;
    if (!assignedPerson) {
      return NextResponse.json({ error: 'La persona seleccionada no está disponible como responsable' }, { status: 400 });
    }
    if (workshopScope.isWorkshopHead) {
      const assigneeSite = workshopSiteFromRoleTitle(assignedPerson.role_title);
      if (assigneeSite && assigneeSite !== workshopScope.site) {
        return NextResponse.json({ error: 'El ejecutor pertenece a otra mina.' }, { status: 403 });
      }
    }

    let asset: CanonicalAssetRow | null = null;
    if (canonicalAssetId) {
      const { data: assetRow, error: assetError } = await context.supabase
        .from('maintenance_canonical_assets_v1')
        .select('id,asset_code,name,asset_type,is_active')
        .eq('organization_id', context.organizationId)
        .eq('id', canonicalAssetId)
        .eq('is_active', true)
        .maybeSingle();
      if (assetError) throw assetError;
      if (!assetRow) return NextResponse.json({ error: 'Equipo no encontrado o inactivo' }, { status: 404 });
      asset = assetRow as CanonicalAssetRow;
      if (workshopScope.isWorkshopHead) {
        const { data: canonicalAsset, error: siteError } = await context.supabase.schema('canonical')
          .from('assets').select('location')
          .eq('organization_id', context.organizationId)
          .eq('id', canonicalAssetId).maybeSingle();
        if (siteError) throw siteError;
        const assetSite = workshopSiteFromKnownLocation(canonicalAsset?.location);
        if (assetSite && assetSite !== workshopScope.site) {
          return NextResponse.json({ error: 'El equipo está registrado en otra mina.' }, { status: 403 });
        }
      }
    }

    if (reviewId) {
      const { data: review, error: reviewError } = await context.supabase
        .from('drilling_maintenance_review_queue_v1')
        .select('review_id,canonical_asset_id,review_reason,review_status,linked_work_order_id')
        .eq('organization_id', context.organizationId)
        .eq('review_id', reviewId)
        .maybeSingle();
      if (reviewError) throw reviewError;
      if (!review) return NextResponse.json({ error: 'Revisión operacional no encontrada' }, { status: 404 });
      if (review.canonical_asset_id !== canonicalAssetId) {
        return NextResponse.json({ error: 'La revisión no corresponde al equipo seleccionado' }, { status: 409 });
      }
      if (review.review_reason !== 'out_of_service' && review.review_status === 'pending') {
        return NextResponse.json({ error: 'La revisión debe ser aceptada antes de crear la orden' }, { status: 409 });
      }

      const { data: rpcData, error: rpcError } = await context.supabase.rpc('create_work_order_from_operational_review', {
        p_organization_id: context.organizationId,
        p_review_id: reviewId,
        p_created_by: context.authUserId,
        p_title: body.title.trim(),
        p_work_type: workType,
        p_priority: body.priority || 'critical',
        p_scheduled_date: body.scheduledDate || body.scheduled_date || null,
        p_description: body.description?.trim() || null,
      });
      if (rpcError) throw rpcError;
      const result = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (!result?.work_order_id) throw new Error('La revisión no devolvió una orden de trabajo válida');

      const { data: linkedOrder, error: linkedOrderError } = await context.supabase
        .from('maintenance_work_orders')
        .select('*')
        .eq('organization_id', context.organizationId)
        .eq('id', result.work_order_id)
        .single();
      if (linkedOrderError) throw linkedOrderError;
      if (workshopScope.isWorkshopHead && linkedOrder.workshop_site && linkedOrder.workshop_site !== workshopScope.site) {
        return NextResponse.json({ error: 'La revisión ya está vinculada a una OT de otra mina.' }, { status: 403 });
      }
      const { data: assignedLinkedOrder, error: assignedLinkedOrderError } = await context.supabase
        .from('maintenance_work_orders')
        .update({
          assigned_person_id: assignedPerson.id,
          assigned_to_name: assignedPerson.full_name,
          ...(workshopScope.isWorkshopHead ? { workshop_site: workshopScope.site } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', context.organizationId)
        .eq('id', result.work_order_id)
        .select('*')
        .single();
      if (assignedLinkedOrderError) throw assignedLinkedOrderError;

      await recordRequestedMaterials(context, assignedLinkedOrder as WorkOrderRow, requestedMaterials);
      await recordStructuredMaterials(context, assignedLinkedOrder.id, materials);
      const standardPlanApplication = await applyRequestedStandardPlan(context, assignedLinkedOrder.id, standardPlanId);

      return NextResponse.json({
        data: mapWorkOrder(assignedLinkedOrder as WorkOrderRow, asset),
        standardPlan: standardPlanApplication,
        review: {
          id: reviewId,
          status: result.review_status,
          linkedWorkOrderId: result.work_order_id,
        },
      }, { status: review.linked_work_order_id ? 200 : 201 });
    }

    if (!creationRequestId || !UUID_PATTERN.test(creationRequestId)) {
      return NextResponse.json(
        { error: 'La solicitud de creación de OT no tiene una clave de idempotencia válida.' },
        { status: 400 },
      );
    }

    const { data: existingRequestOrder, error: existingRequestError } = await context.supabase
      .from('maintenance_work_orders')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('created_by', context.authUserId)
      .eq('creation_request_id', creationRequestId)
      .maybeSingle();
    if (existingRequestError) throw existingRequestError;

    if (existingRequestOrder) {
      if (workshopScope.isWorkshopHead && existingRequestOrder.workshop_site !== workshopScope.site) {
        return NextResponse.json({ error: 'La solicitud ya pertenece a otra faena.' }, { status: 403 });
      }
      const replayedOrder = existingRequestOrder as WorkOrderRow;
      await recordRequestedMaterials(context, replayedOrder, requestedMaterials);
      await recordStructuredMaterials(context, replayedOrder.id, materials);
      const standardPlanApplication = await applyRequestedStandardPlan(context, replayedOrder.id, standardPlanId);
      return NextResponse.json(
        {
          data: mapWorkOrder(replayedOrder, asset),
          standardPlan: standardPlanApplication,
          idempotentReplay: true,
        },
        { status: 200 },
      );
    }

    const assignedPersonName = assignedPerson.full_name;

    const year = new Date().getFullYear();
    const prefix = `OT-${year}-`;
    const plannedHours = Number(body.plannedDurationHours ?? body.planned_duration_hours ?? 0);
    const meterReading = body.meterReading ?? body.meter_reading ?? null;

    const { data: latestOrder, error: latestOrderError } = await context.supabase
      .from('maintenance_work_orders')
      .select('work_order_number')
      .eq('organization_id', context.organizationId)
      .like('work_order_number', `${prefix}%`)
      .order('work_order_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestOrderError) throw latestOrderError;

    const latestSequence = Number.parseInt(String(latestOrder?.work_order_number || '').slice(prefix.length), 10);
    let nextSequence = Number.isFinite(latestSequence) ? latestSequence + 1 : 1;
    let createdOrder: WorkOrderRow | null = null;
    let idempotentReplay = false;

    for (let attempt = 0; attempt < 3 && !createdOrder; attempt += 1) {
      const workOrderNumber = `${prefix}${String(nextSequence).padStart(4, '0')}`;
      const { data: insertedOrder, error: insertError } = await context.supabase
        .from('maintenance_work_orders')
        .insert({
          organization_id: context.organizationId,
          work_order_number: workOrderNumber,
          canonical_asset_id: canonicalAssetId,
          asset_id: null,
          assigned_person_id: assignedPersonId,
          ...(workshopScope.isWorkshopHead ? { workshop_site: workshopScope.site } : {}),
          title: body.title.trim(),
          description: body.description?.trim() || null,
          work_type: workType,
          status: 'open',
          priority: body.priority || 'medium',
          scheduled_date: body.scheduledDate || body.scheduled_date || null,
          planned_duration_hours: Number.isFinite(plannedHours) ? plannedHours : 0,
          assigned_to_name: assignedPersonName,
          meter_reading: meterReading === null || meterReading === '' ? null : Number(meterReading),
          meter_unit: body.meterUnit || body.meter_unit || null,
          cost_center_id: body.costCenterId || body.cost_center_id || null,
          creation_request_id: creationRequestId,
          created_by: context.authUserId,
          updated_at: new Date().toISOString(),
        })
        .select('*')
        .single();

      if (!insertError) {
        createdOrder = insertedOrder as WorkOrderRow;
        break;
      }

      if (insertError.code !== '23505') throw insertError;

      const { data: concurrentOrder, error: concurrentOrderError } = await context.supabase
        .from('maintenance_work_orders')
        .select('*')
        .eq('organization_id', context.organizationId)
        .eq('created_by', context.authUserId)
        .eq('creation_request_id', creationRequestId)
        .maybeSingle();
      if (concurrentOrderError) throw concurrentOrderError;
      if (concurrentOrder) {
        createdOrder = concurrentOrder as WorkOrderRow;
        idempotentReplay = true;
        break;
      }

      nextSequence += 1;
    }

    if (!createdOrder) {
      throw new Error('No se pudo reservar un número único para la orden de trabajo. Intenta nuevamente.');
    }

    await recordRequestedMaterials(context, createdOrder, requestedMaterials);
    await recordStructuredMaterials(context, createdOrder.id, materials);
    const standardPlanApplication = await applyRequestedStandardPlan(context, createdOrder.id, standardPlanId);
    return NextResponse.json(
      {
        data: mapWorkOrder(createdOrder, asset),
        standardPlan: standardPlanApplication,
        idempotentReplay,
      },
      { status: idempotentReplay ? 200 : 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear la orden de trabajo';
    console.error('[maintenance/work-orders:post]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
