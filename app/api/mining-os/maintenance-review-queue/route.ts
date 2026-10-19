export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, isAdminRole, MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const maintenanceAccess = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  const executiveRead = context.role === 'gerente_operaciones' || isAdminRole(context.role);
  if (!executiveRead && maintenanceAccess === 'SR') {
    return NextResponse.json({ error: 'No tienes acceso a esta cola operacional' }, { status: 403 });
  }

  const { data, error } = await context.supabase
    .from('drilling_maintenance_review_queue_v1')
    .select('review_id,source_report_id,canonical_asset_id,asset_code,asset_name,operation_date,review_reason,equipment_status_raw,machine_observations,review_status,linked_work_order_id,has_linked_work_order,policy')
    .eq('organization_id', context.organizationId)
    .neq('review_status', 'dismissed')
    .order('operation_date', { ascending: false })
    .order('asset_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    items: data || [],
    canWrite: maintenanceAccess === 'ED' || isAdminRole(context.role),
    policy: {
      latestReportPerAssetOnly: true,
      noAutomaticWorkOrder: true,
      powerAndWaterAreNotMaintenanceByDefault: true,
      sourceReportRemainsEvidence: true,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  if (!access.organizationId) return NextResponse.json({ error: 'Organización no disponible' }, { status: 400 });

  const body = await request.json().catch(() => null) as { reviewId?: string; status?: string; decisionNote?: string | null } | null;
  const reviewId = String(body?.reviewId || '').trim();
  const status = String(body?.status || '').trim();
  const decisionNote = body?.decisionNote == null ? null : String(body.decisionNote).trim().slice(0, 1000);

  if (!reviewId || !['accepted', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Revisión o estado inválido' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: existing, error: readError } = await supabase
    .from('operational_maintenance_reviews')
    .select('id,status,organization_id,linked_work_order_id')
    .eq('id', reviewId)
    .eq('organization_id', access.organizationId)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Revisión no encontrada' }, { status: 404 });
  if (existing.linked_work_order_id) return NextResponse.json({ error: 'La revisión ya está vinculada a una OT' }, { status: 409 });

  const { data, error } = await supabase
    .from('operational_maintenance_reviews')
    .update({
      status,
      decision_note: decisionNote,
      reviewed_by: access.user.id,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', reviewId)
    .eq('organization_id', access.organizationId)
    .select('id,status,decision_note,reviewed_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ review: data });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  if (!access.organizationId) return NextResponse.json({ error: 'Organización no disponible' }, { status: 400 });

  const body = await request.json().catch(() => null) as {
    reviewId?: string;
    title?: string;
    workType?: string | null;
    priority?: string | null;
    scheduledDate?: string | null;
    description?: string | null;
  } | null;

  const reviewId = String(body?.reviewId || '').trim();
  const title = String(body?.title || '').trim().slice(0, 180);
  const workType = body?.workType == null ? null : String(body.workType).trim().slice(0, 80) || null;
  const priority = body?.priority == null ? null : String(body.priority).trim().slice(0, 40) || null;
  const scheduledDate = body?.scheduledDate == null ? null : String(body.scheduledDate).trim() || null;
  const description = body?.description == null ? null : String(body.description).trim().slice(0, 4000) || null;

  if (!reviewId || !title) return NextResponse.json({ error: 'reviewId y title son obligatorios' }, { status: 400 });
  if (scheduledDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate)) return NextResponse.json({ error: 'scheduledDate inválida' }, { status: 400 });

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_work_order_from_operational_review', {
    p_organization_id: access.organizationId,
    p_review_id: reviewId,
    p_created_by: access.user.id,
    p_title: title,
    p_work_type: workType,
    p_priority: priority,
    p_scheduled_date: scheduledDate,
    p_description: description,
  });

  if (error) {
    const message = error.message.includes('operational_review_must_be_accepted')
      ? 'La revisión debe estar aceptada antes de crear una OT'
      : error.message.includes('operational_review_not_found')
        ? 'Revisión no encontrada'
        : error.message.includes('work_order_title_required')
          ? 'El título de la OT es obligatorio'
          : error.message;
    const status = message === 'Revisión no encontrada'
      ? 404
      : message.startsWith('La revisión debe')
        ? 409
        : message.startsWith('El título')
          ? 400
          : 500;
    return NextResponse.json({ error: message }, { status });
  }

  const rpcWorkOrder = Array.isArray(data) ? data[0] : data;
  if (!rpcWorkOrder?.work_order_id) {
    return NextResponse.json({ error: 'La OT fue procesada sin una identidad válida' }, { status: 500 });
  }

  // The RPC owns atomicity/idempotency. Read the resulting OT back so this API
  // preserves the pre-RPC response contract (id/status/title/etc.) while also
  // exposing the explicit RPC fields used by newer clients.
  const { data: authoritativeWorkOrder, error: workOrderReadError } = await supabase
    .from('maintenance_work_orders')
    .select('id,work_order_number,canonical_asset_id,title,status,priority,work_type,scheduled_date,description')
    .eq('id', rpcWorkOrder.work_order_id)
    .eq('organization_id', access.organizationId)
    .maybeSingle();

  if (workOrderReadError) {
    return NextResponse.json({ error: workOrderReadError.message }, { status: 500 });
  }

  const workOrder = authoritativeWorkOrder
    ? {
        ...authoritativeWorkOrder,
        work_order_id: authoritativeWorkOrder.id,
        work_order_status: authoritativeWorkOrder.status,
        review_status: rpcWorkOrder.review_status,
        source_report_id: rpcWorkOrder.source_report_id,
      }
    : {
        id: rpcWorkOrder.work_order_id,
        work_order_id: rpcWorkOrder.work_order_id,
        work_order_number: rpcWorkOrder.work_order_number,
        canonical_asset_id: rpcWorkOrder.canonical_asset_id,
        title,
        status: rpcWorkOrder.work_order_status,
        work_order_status: rpcWorkOrder.work_order_status,
        priority,
        work_type: workType,
        scheduled_date: scheduledDate,
        description,
        review_status: rpcWorkOrder.review_status,
        source_report_id: rpcWorkOrder.source_report_id,
      };

  return NextResponse.json({ workOrder }, { status: 201 });
}
