export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, getModuleAccessLevel, requireModuleAccess } from '@/lib/api/module-access';

type ReviewRow = {
  id: string;
  source_report_id: string;
  canonical_asset_id: string;
  review_reason: string;
  status: string;
  linked_work_order_id: string | null;
  decision_note: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.PROD_SONDAJE_PRODUCCION);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const maintenanceAccess = await getModuleAccessLevel(access.user.id, access.role, MODULE_KEYS.MANT_OPERACIONES);
  const canCreateWorkOrder = access.canWrite && maintenanceAccess === 'ED';

  const reviewsResult = await context.supabase
    .from('operational_maintenance_reviews')
    .select('id,source_report_id,canonical_asset_id,review_reason,status,linked_work_order_id,decision_note,created_at')
    .eq('organization_id', context.organizationId)
    .neq('status', 'dismissed')
    .order('created_at', { ascending: false })
    .limit(40);

  if (reviewsResult.error) return NextResponse.json({ error: reviewsResult.error.message }, { status: 500 });

  const reviews = (reviewsResult.data || []) as ReviewRow[];
  const reportIds = [...new Set(reviews.map((row) => row.source_report_id).filter(Boolean))];
  const workOrderIds = [...new Set(reviews.map((row) => row.linked_work_order_id).filter((id): id is string => Boolean(id)))];

  const [reportsResult, workOrdersResult] = await Promise.all([
    reportIds.length
      ? context.supabase
          .from('production_drilling_source_reports')
          .select('id,operation_date,rig_name_raw,hole_code_raw,equipment_status_raw,machine_observations,drilling_observations')
          .eq('organization_id', context.organizationId)
          .in('id', reportIds)
      : Promise.resolve({ data: [], error: null }),
    workOrderIds.length
      ? context.supabase
          .from('maintenance_work_orders')
          .select('id,work_order_number,status,priority,title,updated_at')
          .eq('organization_id', context.organizationId)
          .in('id', workOrderIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const error = reportsResult.error || workOrdersResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const reportsById = new Map((reportsResult.data || []).map((row) => [row.id, row]));
  const workOrdersById = new Map((workOrdersResult.data || []).map((row) => [row.id, row]));

  const rows = reviews.map((review) => ({
    ...review,
    sourceReport: reportsById.get(review.source_report_id) || null,
    workOrder: review.linked_work_order_id ? workOrdersById.get(review.linked_work_order_id) || null : null,
  }));

  return NextResponse.json({
    rows,
    canCreateWorkOrder,
    summary: {
      total: rows.length,
      pending: rows.filter((row) => !row.linked_work_order_id).length,
      linked: rows.filter((row) => Boolean(row.linked_work_order_id)).length,
      outOfService: rows.filter((row) => row.review_reason === 'out_of_service' && !row.linked_work_order_id).length,
    },
  });
}

export async function POST(request: NextRequest) {
  const productionAccess = await requireModuleAccess(request, MODULE_KEYS.PROD_SONDAJE_PRODUCCION, true);
  if (!productionAccess.authorized) return productionAccess.response;

  const maintenanceAccess = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!maintenanceAccess.authorized) return maintenanceAccess.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const reviewId = String(body?.reviewId || '').trim();
  const decisionNote = String(body?.decisionNote || '').trim();
  if (!reviewId) return NextResponse.json({ error: 'La revisión operacional es obligatoria' }, { status: 400 });

  const reviewResult = await context.supabase
    .from('operational_maintenance_reviews')
    .select('id,source_report_id,review_reason,status,linked_work_order_id')
    .eq('organization_id', context.organizationId)
    .eq('id', reviewId)
    .maybeSingle();

  if (reviewResult.error) return NextResponse.json({ error: reviewResult.error.message }, { status: 500 });
  const review = reviewResult.data;
  if (!review) return NextResponse.json({ error: 'Revisión operacional no encontrada' }, { status: 404 });

  const sourceResult = await context.supabase
    .from('production_drilling_source_reports')
    .select('id,operation_date,rig_name_raw,hole_code_raw,equipment_status_raw,machine_observations,drilling_observations')
    .eq('organization_id', context.organizationId)
    .eq('id', review.source_report_id)
    .maybeSingle();

  if (sourceResult.error) return NextResponse.json({ error: sourceResult.error.message }, { status: 500 });
  const source = sourceResult.data;
  const rigName = source?.rig_name_raw || 'equipo de sondaje';

  if (!review.linked_work_order_id && review.status === 'pending' && review.review_reason !== 'out_of_service') {
    const accepted = await context.supabase
      .from('operational_maintenance_reviews')
      .update({
        status: 'accepted',
        decision_note: decisionNote || 'Aceptada desde Sondaje para evaluación de Mantención.',
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', context.organizationId)
      .eq('id', reviewId)
      .eq('status', 'pending');

    if (accepted.error) return NextResponse.json({ error: accepted.error.message }, { status: 400 });
  }

  const priority = review.review_reason === 'out_of_service' ? 'critical' : 'high';
  const title = review.review_reason === 'out_of_service'
    ? `Restablecer ${rigName}`
    : `Revisar condición operacional · ${rigName}`;

  const rpcResult = await context.supabase.rpc('create_work_order_from_operational_review', {
    p_organization_id: context.organizationId,
    p_review_id: reviewId,
    p_created_by: context.userId,
    p_title: title,
    p_work_type: 'corrective',
    p_priority: priority,
    p_scheduled_date: null,
    p_description: decisionNote || null,
  });

  if (rpcResult.error) return NextResponse.json({ error: rpcResult.error.message }, { status: 400 });
  const result = Array.isArray(rpcResult.data) ? rpcResult.data[0] : rpcResult.data;

  return NextResponse.json({ ok: true, workOrder: result });
}
