export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

// First production READY deployment enforcing the mechanic's fluid declaration.
 // This is a one-time historical cutoff, not an exemption for new OT closures.
const FLUID_DECLARATION_REQUIRED_FROM = Date.parse('2026-11-04T18:15:53.252Z');

function isLegacyFluidDeclarationExempt(
  order: { status?: string | null; created_by?: string | null; closed_at?: string | null },
  fluidDeclaration: { id: number } | null,
  fluidUsageCount: number,
) {
  if (order.status !== 'completed' || !order.created_by || !order.closed_at || fluidDeclaration || fluidUsageCount !== 0) {
    return false;
  }
  const closedAt = Date.parse(order.closed_at);
  return Number.isFinite(closedAt) && closedAt < FLUID_DECLARATION_REQUIRED_FROM;
}

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
  const authorizedReviewers = new Set(['Ariel López', 'Mauricio Astudillo']);
  return authorizedReviewers.has(String(data.full_name || '')) ? data : null;
}

async function authorizeRead(request: NextRequest, workOrderId: string) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context;
  const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (accessLevel === 'ED' && context.role !== 'tecnico') return context;
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
    .select('id,status,work_order_number,closed_at,created_by')
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

  const { data: fluidDeclaration, error: fluidDeclarationError } = await context.supabase
    .from('work_order_events')
    .select('id,event_at,actor_id,actor_name,payload')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .eq('event_type', 'fluid_closure_declared')
    .order('event_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fluidDeclarationError) return NextResponse.json({ error: fluidDeclarationError.message }, { status: 500 });

  const { data: fluidUsage, error: fluidUsageError } = await context.supabase
    .from('maintenance_fluid_usage_records')
    .select('id,fluid_name,quantity_liters,total_cost,cost_state,warehouse_code,used_at')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .order('used_at', { ascending: true });
  if (fluidUsageError) return NextResponse.json({ error: fluidUsageError.message }, { status: 500 });

  const hasValidFluidDeclaration = Boolean(fluidDeclaration && (fluidDeclaration.payload as any)?.declared_by_assigned_executor === true);
  const legacyFluidDeclarationExemption = isLegacyFluidDeclarationExempt(workOrder, fluidDeclaration, (fluidUsage || []).length);
  const reviewer = await getReviewerPerson(context);
  return NextResponse.json({
    approvedInstallations: approvedInstallations || [],
    materialRequirementsCount: materialRequirementsCount || 0,
    fluidClosure: fluidDeclaration || null,
    fluidUsage: fluidUsage || [],
    legacyFluidDeclarationExemption,
    review: review || {
      status: String(workOrder.status || '') === 'completed' ? 'pending' : null,
      decision_note: null,
      reviewed_by_name: null,
      reviewed_at: null,
    },
    canApprove: Boolean(reviewer)
      && (hasValidFluidDeclaration || legacyFluidDeclarationExemption)
      && String(workOrder.status || '') === 'completed'
      && review?.status !== 'approved',
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
    return NextResponse.json({ error: 'Ariel López o Mauricio Astudillo deben revisar y aprobar la OT.' }, { status: 403 });
  }

  const { data: workOrder, error: workOrderError } = await context.supabase
    .from('maintenance_work_orders')
    .select('id,status,work_order_number,canonical_asset_id,created_by,closed_at')
    .eq('organization_id', context.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (workOrderError) return NextResponse.json({ error: workOrderError.message }, { status: 500 });
  if (!workOrder) return NextResponse.json({ error: 'No se encontró la orden de trabajo.' }, { status: 404 });
  if (String(workOrder.status || '') !== 'completed') {
    return NextResponse.json({ error: 'La OT debe estar terminada antes de ser aprobada.' }, { status: 409 });
  }

  const { data: fluidDeclaration, error: fluidDeclarationError } = await context.supabase
    .from('work_order_events')
    .select('id,actor_id,actor_name,payload,event_at')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .eq('event_type', 'fluid_closure_declared')
    .order('event_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (fluidDeclarationError) return NextResponse.json({ error: fluidDeclarationError.message }, { status: 500 });
  // A previously closed OT must not be silently reclassified as "no oil used".
  // Legacy exception applies only to closures BEFORE the policy was live and with
  // no mechanic declaration or recorded fluid usage. New OT still require the mechanic.
  let legacyFluidDeclarationExemption = false;
  if (!fluidDeclaration) {
    const { count: fluidUsageCount, error: fluidUsageError } = await context.supabase
      .from('maintenance_fluid_usage_records')
      .select('id', { head: true, count: 'exact' })
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id);
    if (fluidUsageError) return NextResponse.json({ error: fluidUsageError.message }, { status: 500 });
    legacyFluidDeclarationExemption = isLegacyFluidDeclarationExempt(workOrder, fluidDeclaration, fluidUsageCount || 0);
  }
  if (!legacyFluidDeclarationExemption && (!fluidDeclaration || (fluidDeclaration.payload as any)?.declared_by_assigned_executor !== true)) {
    return NextResponse.json(
      { error: 'El mecánico asignado debe completar la declaración de aceites/fluidos antes de la aprobación de Ariel o Mauricio.' },
      { status: 409 },
    );
  }

  const body = (await request.json().catch(() => null)) as { note?: string | null; confirmMaterialsInstalled?: boolean } | null;
  const historicalNote = legacyFluidDeclarationExemption
    ? 'Excepción histórica: OT cerrada antes de la obligatoriedad de declarar fluidos. Uso y residuos no informados.'
    : null;
  const note = [body?.note?.trim(), historicalNote].filter(Boolean).join(' · ') || null;
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
