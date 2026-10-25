export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { applyStandardJobPlanToWorkOrder } from '@/lib/maintenance/apply-standard-job-plan';

const text = (value: unknown) => String(value ?? '').trim();
const num = (value: unknown) => Number(value ?? 0);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const canonical = context.supabase.schema('canonical');

  try {
    const [{ data: plans, error: plansError }, { data: applications, error: applicationsError }] = await Promise.all([
      context.supabase.from('maintenance_standard_job_plans').select('*').eq('organization_id', context.organizationId).order('updated_at', { ascending: false }),
      context.supabase.from('maintenance_standard_job_plan_applications').select('*').eq('organization_id', context.organizationId).eq('status', 'active'),
    ]);
    if (plansError) throw plansError;
    if (applicationsError) throw applicationsError;

    const planIds = (plans || []).map((row: any) => row.id);
    const assetIds = [...new Set((plans || []).map((row: any) => row.canonical_asset_id).filter(Boolean))];
    const [{ data: steps }, { data: materials }, { data: assets }, { data: products }] = await Promise.all([
      planIds.length ? context.supabase.from('maintenance_standard_job_plan_steps').select('*').eq('organization_id', context.organizationId).in('plan_id', planIds).order('sequence_no') : Promise.resolve({ data: [] }),
      planIds.length ? context.supabase.from('maintenance_standard_job_plan_materials').select('*').eq('organization_id', context.organizationId).in('plan_id', planIds) : Promise.resolve({ data: [] }),
      assetIds.length ? canonical.from('assets').select('id,asset_code,name,asset_type').eq('organization_id', context.organizationId).in('id', assetIds) : Promise.resolve({ data: [] }),
      Promise.resolve({ data: [] as any[] }),
    ]);

    const productIds = [...new Set((materials || []).map((row: any) => row.canonical_product_id).filter(Boolean))];
    let productRows: any[] = products || [];
    if (productIds.length) {
      const { data } = await canonical.from('products').select('id,product_code,name,unit').eq('organization_id', context.organizationId).in('id', productIds);
      productRows = data || [];
    }
    const assetMap = new Map((assets || []).map((row: any) => [row.id, row]));
    const productMap = new Map(productRows.map((row: any) => [row.id, row]));

    const items = (plans || []).map((plan: any) => ({
      ...plan,
      proposal_source: plan.proposed_by ? 'human' : 'motil',
      asset: plan.canonical_asset_id ? assetMap.get(plan.canonical_asset_id) || null : null,
      steps: (steps || []).filter((row: any) => row.plan_id === plan.id),
      materials: (materials || []).filter((row: any) => row.plan_id === plan.id).map((row: any) => ({ ...row, product: productMap.get(row.canonical_product_id) || null })),
      applications: (applications || []).filter((row: any) => row.plan_id === plan.id),
    }));

    return NextResponse.json({
      counts: {
        total: items.length,
        approved: items.filter((row: any) => row.status === 'approved').length,
        proposed: items.filter((row: any) => row.status === 'proposed').length,
        activeApplications: (applications || []).length,
      },
      items,
      canEdit: access.canWrite,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar los planes estándar.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => null);
  const action = text(body?.action) || 'create';

  try {
    if (action === 'apply_work_order') {
      const planId = text(body?.planId);
      const workOrderId = text(body?.workOrderId);
      if (!planId || !workOrderId) return NextResponse.json({ error: 'Selecciona plan y orden de trabajo.' }, { status: 400 });
      const result = await applyStandardJobPlanToWorkOrder({ supabase: context.supabase, organizationId: context.organizationId, userId: context.userId, planId, workOrderId });
      return NextResponse.json({ ok: true, ...result });
    }

    if (action === 'apply_preventive') {
      const planId = text(body?.planId);
      const preventiveId = text(body?.preventiveId);
      if (!planId || !preventiveId) return NextResponse.json({ error: 'Selecciona plan y preventivo.' }, { status: 400 });
      const [{ data: plan }, { data: schedule }] = await Promise.all([
        context.supabase.from('maintenance_standard_job_plans').select('id,status,canonical_asset_id').eq('organization_id', context.organizationId).eq('id', planId).maybeSingle(),
        context.supabase.from('preventive_maintenance_schedules').select('id,canonical_asset_id').eq('organization_id', context.organizationId).eq('id', preventiveId).maybeSingle(),
      ]);
      if (!plan || plan.status !== 'approved') return NextResponse.json({ error: 'El plan estándar debe estar aprobado.' }, { status: 400 });
      if (!schedule) return NextResponse.json({ error: 'Preventivo no encontrado.' }, { status: 404 });
      if (plan.canonical_asset_id && plan.canonical_asset_id !== schedule.canonical_asset_id) return NextResponse.json({ error: 'El plan estándar está aprobado para otro equipo.' }, { status: 409 });
      const { data: existing } = await context.supabase.from('maintenance_standard_job_plan_applications').select('id,plan_id').eq('organization_id', context.organizationId).eq('preventive_schedule_id', preventiveId).eq('status', 'active').maybeSingle();
      if (existing && existing.plan_id !== planId) return NextResponse.json({ error: 'El preventivo ya tiene otro plan estándar activo.' }, { status: 409 });
      if (!existing) {
        const { error } = await context.supabase.from('maintenance_standard_job_plan_applications').insert({ organization_id: context.organizationId, plan_id: planId, preventive_schedule_id: preventiveId, status: 'active', applied_by: context.userId, applied_at: new Date().toISOString() });
        if (error) throw error;
      }
      return NextResponse.json({ ok: true });
    }

    const planCode = text(body?.planCode);
    const name = text(body?.name);
    const workType = text(body?.workType);
    const assetCode = text(body?.assetCode);
    const assetType = text(body?.assetType) || null;
    const reason = text(body?.reason);
    const steps = Array.isArray(body?.steps) ? body.steps : [];
    const materials = Array.isArray(body?.materials) ? body.materials : [];
    if (!planCode || !name || !workType || !reason || steps.length === 0) return NextResponse.json({ error: 'Completa código, nombre, tipo de trabajo, fundamento y al menos un paso.' }, { status: 400 });

    const canonical = context.supabase.schema('canonical');
    let asset: any = null;
    if (assetCode) {
      const { data } = await canonical.from('assets').select('id,asset_code,name').eq('organization_id', context.organizationId).eq('asset_code', assetCode).maybeSingle();
      if (!data) return NextResponse.json({ error: 'No existe un equipo canónico con ese código.' }, { status: 404 });
      asset = data;
    }

    const materialRows: any[] = [];
    for (const material of materials) {
      const productCode = text(material?.productCode);
      const quantityRequired = num(material?.quantityRequired);
      if (!productCode || !Number.isFinite(quantityRequired) || quantityRequired <= 0) return NextResponse.json({ error: 'Cada material requiere código canónico y cantidad mayor a cero.' }, { status: 400 });
      const { data: product } = await canonical.from('products').select('id,product_code').eq('organization_id', context.organizationId).eq('product_code', productCode).maybeSingle();
      if (!product) return NextResponse.json({ error: `Producto canónico no encontrado: ${productCode}` }, { status: 404 });
      let bomLineId: string | null = text(material?.bomLineId) || null;
      if (bomLineId) {
        const { data: bom } = await context.supabase.from('equipment_technical_bom_lines').select('id,canonical_asset_id,canonical_product_id,status').eq('organization_id', context.organizationId).eq('id', bomLineId).maybeSingle();
        if (!bom || bom.status !== 'approved' || bom.canonical_product_id !== product.id || (asset && bom.canonical_asset_id !== asset.id)) return NextResponse.json({ error: `La línea BOM indicada para ${productCode} no está aprobada para este contexto.` }, { status: 409 });
      }
      materialRows.push({ canonical_product_id: product.id, bom_line_id: bomLineId, quantity_required: quantityRequired, notes: text(material?.notes) || null });
    }

    const stepRows = steps.map((step: any, index: number) => ({
      organization_id: context.organizationId,
      plan_id: null as string | null,
      sequence_no: index + 1,
      title: text(step?.title),
      instructions: text(step?.instructions) || null,
      control_requirement: text(step?.controlRequirement) || null,
      required_document_reference: text(step?.requiredDocumentReference) || null,
      estimated_minutes: step?.estimatedMinutes ? num(step.estimatedMinutes) : null,
    }));
    if (stepRows.some((row: any) => !row.title)) {
      return NextResponse.json({ error: 'Cada paso requiere un título.' }, { status: 400 });
    }

    const { data: plan, error: planError } = await context.supabase.from('maintenance_standard_job_plans').insert({
      organization_id: context.organizationId,
      plan_code: planCode,
      name,
      work_type: workType,
      canonical_asset_id: asset?.id || null,
      asset_type: assetType,
      status: 'proposed',
      estimated_duration_hours: body?.estimatedDurationHours ? num(body.estimatedDurationHours) : null,
      labor_people_required: body?.laborPeopleRequired ? Math.max(1, Math.trunc(num(body.laborPeopleRequired))) : null,
      skill_requirement: text(body?.skillRequirement) || null,
      safety_controls: text(body?.safetyControls) || null,
      required_document_reference: text(body?.requiredDocumentReference) || null,
      reason,
      evidence_reference: text(body?.evidenceReference) || null,
      proposed_by: context.userId,
      proposed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single();
    if (planError) throw planError;

    const { error: stepsError } = await context.supabase.from('maintenance_standard_job_plan_steps').insert(
      stepRows.map((row: any) => ({ ...row, plan_id: plan.id })),
    );
    if (stepsError) throw stepsError;
    if (materialRows.length) {
      const { error: materialsError } = await context.supabase.from('maintenance_standard_job_plan_materials').insert(materialRows.map((row) => ({ ...row, organization_id: context.organizationId, plan_id: plan.id })));
      if (materialsError) throw materialsError;
    }
    return NextResponse.json({ ok: true, id: plan.id, status: 'proposed' }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo guardar el plan estándar.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => null);
  const id = text(body?.id);
  const status = text(body?.status);
  if (!id || !['approved','rejected','inactive'].includes(status)) return NextResponse.json({ error: 'Cambio de estado inválido.' }, { status: 400 });
  const { data: plan } = await context.supabase.from('maintenance_standard_job_plans').select('id,status,proposed_by,proposed_at,plan_code,name').eq('organization_id', context.organizationId).eq('id', id).maybeSingle();
  if (!plan) return NextResponse.json({ error: 'Plan estándar no encontrado.' }, { status: 404 });
  if (status === 'approved') {
    const { count: stepCount, error: stepCountError } = await context.supabase
      .from('maintenance_standard_job_plan_steps')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId)
      .eq('plan_id', id);
    if (stepCountError) return NextResponse.json({ error: 'No se pudo verificar la completitud del plan.' }, { status: 500 });
    if (!stepCount) return NextResponse.json({ error: 'El plan aún no tiene pasos validados. Ariel debe completar el procedimiento antes de aprobar.' }, { status: 409 });
  }
  const approved = status === 'approved';
  const { error } = await context.supabase.from('maintenance_standard_job_plans').update({ status, approved_by: approved ? context.userId : null, approved_at: approved ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('organization_id', context.organizationId).eq('id', id);
  if (error) return NextResponse.json({ error: 'No se pudo actualizar el plan estándar.' }, { status: 500 });

  const proposedAtMs = plan.proposed_at ? Date.parse(String(plan.proposed_at)) : NaN;
  const decisionCycleSeconds = Number.isFinite(proposedAtMs)
    ? Math.max(0, Math.round((Date.now() - proposedAtMs) / 1000))
    : null;
  const proposalSource = plan.proposed_by ? 'human' : 'motil';
  const { error: auditError } = await context.supabase.from('audit_log').insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    action: 'maintenance_standard_plan_decision',
    resource_type: 'maintenance_standard_job_plan',
    resource_id: id,
    resource_identifier: plan.plan_code || id,
    old_values: { status: plan.status },
    new_values: {
      status,
      proposal_source: proposalSource,
      decision_cycle_seconds: decisionCycleSeconds,
      plan_name: plan.name || null,
      metric_version: 'maintenance-standard-plan-decision-v1',
      semantics: 'human decision on a standard plan proposal; approval is not economic impact',
    },
    user_agent: request.headers.get('user-agent'),
    status: 'completed',
  });
  if (auditError) console.error('[maintenance/standard-job-plans:decision-audit]', auditError);

  return NextResponse.json({ ok: true, status, proposalSource, decisionCycleSeconds });
}
