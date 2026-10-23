export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

async function getReviewerPerson(context: Awaited<ReturnType<typeof getOrganizationContext>>) {
  if (!context.ok) return null;
  const { data, error } = await context.supabase
    .from('people')
    .select('id,full_name')
    .eq('organization_id', context.organizationId)
    .eq('profile_id', context.userId)
    .eq('employment_status', 'active')
    .maybeSingle();
  if (error || !data) return null;
  return ['Ariel López', 'Mauricio Astudillo'].includes(String(data.full_name || '')) ? data : null;
}

async function authorizeRead(request: NextRequest, workOrderId: string) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context;
  const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (accessLevel === 'ED') return context;
  const assigned = await requireAssignedMaintenanceExecution(context, workOrderId);
  if (!assigned.ok) return { ok: false as const, response: assigned.response };
  return context;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await authorizeRead(request, id);
  if (!context.ok) return context.response;

  const { data: workOrder, error: workOrderError } = await context.supabase
    .from('maintenance_work_orders')
    .select('id,status,work_order_number,materials_required,materials_reviewed_at')
    .eq('organization_id', context.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (workOrderError) return NextResponse.json({ error: workOrderError.message }, { status: 500 });
  if (!workOrder) return NextResponse.json({ error: 'No se encontró la orden de trabajo.' }, { status: 404 });

  const { data: review, error: reviewError } = await context.supabase
    .from('work_order_supervisor_reviews')
    .select('id,status,decision_note,reviewed_by_name,reviewed_at,created_at,updated_at')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .maybeSingle();
  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 500 });

  const { count: materialRequirementsCount, error: requirementsError } = await context.supabase
    .from('work_order_material_requirements')
    .select('id', { head: true, count: 'exact' })
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .neq('status', 'cancelled');
  if (requirementsError) return NextResponse.json({ error: requirementsError.message }, { status: 500 });

  const { data: approvedInstallations, error: installationsError } = await context.supabase
    .from('work_order_material_approval_installations')
    .select('canonical_product_id,installed_quantity,confirmed_by_name,confirmed_at,warehouse_reconciliation_status')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id);
  if (installationsError) return NextResponse.json({ error: installationsError.message }, { status: 500 });

  const reviewer = await getReviewerPerson(context);
  return NextResponse.json({
    approvedInstallations: approvedInstallations || [],
    materialRequirementsCount: materialRequirementsCount || 0,
    review: review || {
      status: String(workOrder.status || '') === 'completed' ? 'pending' : null,
      decision_note: null,
      reviewed_by_name: null,
      reviewed_at: null,
    },
    materialDeclaration: {
      requiresMaterials: workOrder.materials_required,
      reviewedAt: workOrder.materials_reviewed_at,
    },
    approvalBlocker: workOrder.materials_required == null ? 'Confirma si la OT utilizó materiales antes de aprobar.' : null,
    canApprove: Boolean(reviewer) && String(workOrder.status || '') === 'completed' && review?.status !== 'approved' && workOrder.materials_required != null,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
  if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

  const reviewer = await getReviewerPerson(context);
  if (!reviewer) {
    return NextResponse.json({ error: 'Solo Ariel López o Mauricio Astudillo pueden aprobar la OT.' }, { status: 403 });
  }

  const { data: workOrder, error: workOrderError } = await context.supabase
    .from('maintenance_work_orders')
    .select('id,status,work_order_number,canonical_asset_id,materials_required,materials_reviewed_at')
    .eq('organization_id', context.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (workOrderError) return NextResponse.json({ error: workOrderError.message }, { status: 500 });
  if (!workOrder) return NextResponse.json({ error: 'No se encontró la orden de trabajo.' }, { status: 404 });
  if (String(workOrder.status || '') !== 'completed') {
    return NextResponse.json({ error: 'La OT debe estar terminada antes de ser aprobada.' }, { status: 409 });
  }
  if (workOrder.materials_required == null) {
    return NextResponse.json({ error: 'Confirma si la OT utilizó materiales antes de aprobar.' }, { status: 409 });
  }

  const { count: activeMaterialRequirements, error: activeRequirementsError } = await context.supabase
    .from('work_order_material_requirements')
    .select('id', { head: true, count: 'exact' })
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .neq('status', 'cancelled');
  if (activeRequirementsError) return NextResponse.json({ error: activeRequirementsError.message }, { status: 500 });
  if (workOrder.materials_required === true && Number(activeMaterialRequirements || 0) === 0) {
    return NextResponse.json({ error: 'La OT está marcada con uso de materiales, pero no tiene materiales requeridos registrados.' }, { status: 409 });
  }
  if (workOrder.materials_required === false && Number(activeMaterialRequirements || 0) > 0) {
    return NextResponse.json({ error: 'La OT está marcada sin materiales, pero existen requerimientos activos.' }, { status: 409 });
  }

  const body = (await request.json().catch(() => null)) as { note?: string | null; confirmMaterialsInstalled?: boolean } | null;
  const note = body?.note?.trim() || null;
  const { data: reviewId, error: approvalError } = await context.supabase.rpc(
    'approve_work_order_with_material_confirmation_v1',
    {
      p_organization_id: context.organizationId,
      p_work_order_id: id,
      p_reviewer_profile_id: context.userId,
      p_confirm_materials_installed: body?.confirmMaterialsInstalled === true,
      p_decision_note: note,
    },
  );
  if (approvalError) {
    const code = approvalError.code;
    const status = code === '55000' ? 409 : code === '42501' ? 403 : 500;
    return NextResponse.json({ error: approvalError.message }, { status });
  }

  const { data: review, error: readError } = await context.supabase
    .from('work_order_supervisor_reviews')
    .select('id,status,decision_note,reviewed_by_name,reviewed_at')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .eq('id', reviewId)
    .single();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  return NextResponse.json({ review });
}
