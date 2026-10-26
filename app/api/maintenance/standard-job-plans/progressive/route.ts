export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const text = (value: unknown) => String(value ?? '').trim();
const num = (value: unknown) => Number(value ?? 0);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const scheduleId = text(request.nextUrl.searchParams.get('scheduleId'));
  if (!scheduleId) return NextResponse.json({ error: 'Falta scheduleId.' }, { status: 400 });

  try {
    const { data: schedule, error: scheduleError } = await context.supabase
      .from('preventive_maintenance_schedules')
      .select('id,task_name,description,frequency_hours,estimated_duration_hours,canonical_asset_id,source_reference')
      .eq('organization_id', context.organizationId)
      .eq('id', scheduleId)
      .maybeSingle();
    if (scheduleError) throw scheduleError;
    if (!schedule) return NextResponse.json({ error: 'Pauta preventiva no encontrada.' }, { status: 404 });

    const { data: applications, error: applicationError } = await context.supabase
      .from('maintenance_standard_job_plan_applications')
      .select('plan_id,status,created_at')
      .eq('organization_id', context.organizationId)
      .eq('preventive_schedule_id', scheduleId)
      .order('created_at', { ascending: false });
    if (applicationError) throw applicationError;

    const planId = applications?.[0]?.plan_id || null;
    let plan: any = null;
    let steps: any[] = [];
    let materials: any[] = [];
    if (planId) {
      const [planResult, stepsResult, materialsResult] = await Promise.all([
        context.supabase.from('maintenance_standard_job_plans').select('*').eq('organization_id', context.organizationId).eq('id', planId).maybeSingle(),
        context.supabase.from('maintenance_standard_job_plan_steps').select('*').eq('organization_id', context.organizationId).eq('plan_id', planId).order('sequence_no'),
        context.supabase.from('maintenance_standard_job_plan_materials').select('*').eq('organization_id', context.organizationId).eq('plan_id', planId),
      ]);
      if (planResult.error) throw planResult.error;
      if (stepsResult.error) throw stepsResult.error;
      if (materialsResult.error) throw materialsResult.error;
      plan = planResult.data;
      steps = stepsResult.data || [];
      materials = materialsResult.data || [];
    }

    return NextResponse.json({ schedule, plan, steps, materials, canEdit: access.canWrite });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo cargar el plan progresivo.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const action = text(body?.action);
  const moduleKey = action === 'approve' ? MODULE_KEYS.MANT_GERENCIAL : MODULE_KEYS.MANT_OPERACIONES;
  const access = await requireModuleAccess(request, moduleKey, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    if (action === 'propose') {
      const scheduleId = text(body?.scheduleId);
      const { data, error } = await context.supabase.rpc('propose_standard_job_plan_from_schedule_v1', { p_schedule_id: scheduleId });
      if (error) throw error;
      return NextResponse.json({ ok: true, planId: data });
    }

    const planId = text(body?.planId);
    if (!planId) return NextResponse.json({ error: 'Falta planId.' }, { status: 400 });
    const { data: plan } = await context.supabase.from('maintenance_standard_job_plans').select('id,status,plan_code,proposed_by').eq('organization_id', context.organizationId).eq('id', planId).maybeSingle();
    if (!plan) return NextResponse.json({ error: 'Plan estándar no encontrado.' }, { status: 404 });

    if (action === 'add_step') {
      if (plan.status !== 'proposed') return NextResponse.json({ error: 'Sólo se editan planes propuestos.' }, { status: 409 });
      const title = text(body?.title);
      if (!title) return NextResponse.json({ error: 'El paso requiere título.' }, { status: 400 });
      const newStep = {
        title,
        instructions: text(body?.instructions) || null,
        control_requirement: text(body?.controlRequirement) || null,
        estimated_minutes: body?.estimatedMinutes ? num(body.estimatedMinutes) : null,
      };
      const { data, error } = await context.supabase.rpc('add_standard_job_plan_step_v1', {
        p_plan_id: planId,
        p_title: newStep.title,
        p_instructions: newStep.instructions,
        p_control_requirement: newStep.control_requirement,
        p_estimated_minutes: newStep.estimated_minutes,
      });
      if (error) throw error;
      await context.supabase.from('audit_log').insert({
        organization_id: context.organizationId,
        user_id: context.userId,
        action: 'maintenance_standard_plan_edited',
        resource_type: 'maintenance_standard_job_plan',
        resource_id: planId,
        resource_identifier: plan.plan_code || planId,
        new_values: { edit_type: 'add_step', step: newStep, step_id: data, proposal_source: plan.proposed_by ? 'human' : 'motil' },
        user_agent: request.headers.get('user-agent'),
        status: 'completed',
      });
      return NextResponse.json({ ok: true, stepId: data });
    }

    if (action === 'update_step') {
      if (plan.status !== 'proposed') return NextResponse.json({ error: 'Sólo se editan planes propuestos.' }, { status: 409 });
      const stepId = text(body?.stepId);
      const title = text(body?.title);
      if (!stepId || !title) return NextResponse.json({ error: 'Paso y título son obligatorios.' }, { status: 400 });
      const { data: currentStep } = await context.supabase
        .from('maintenance_standard_job_plan_steps')
        .select('id,title,instructions,control_requirement,estimated_minutes')
        .eq('organization_id', context.organizationId)
        .eq('plan_id', planId)
        .eq('id', stepId)
        .maybeSingle();
      if (!currentStep) return NextResponse.json({ error: 'Paso no encontrado.' }, { status: 404 });
      const nextValues = {
        title,
        instructions: text(body?.instructions) || null,
        control_requirement: text(body?.controlRequirement) || null,
        estimated_minutes: body?.estimatedMinutes ? num(body.estimatedMinutes) : null,
      };
      const { error } = await context.supabase
        .from('maintenance_standard_job_plan_steps')
        .update(nextValues)
        .eq('organization_id', context.organizationId)
        .eq('plan_id', planId)
        .eq('id', stepId);
      if (error) throw error;
      await context.supabase.from('audit_log').insert({
        organization_id: context.organizationId,
        user_id: context.userId,
        action: 'maintenance_standard_plan_edited',
        resource_type: 'maintenance_standard_job_plan',
        resource_id: planId,
        resource_identifier: plan.plan_code || planId,
        old_values: { step: currentStep },
        new_values: { edit_type: 'update_step', step: nextValues, proposal_source: plan.proposed_by ? 'human' : 'motil' },
        user_agent: request.headers.get('user-agent'),
        status: 'completed',
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove_step') {
      if (plan.status !== 'proposed') return NextResponse.json({ error: 'Sólo se editan planes propuestos.' }, { status: 409 });
      const stepId = text(body?.stepId);
      if (!stepId) return NextResponse.json({ error: 'Falta stepId.' }, { status: 400 });
      const { data: currentStep } = await context.supabase
        .from('maintenance_standard_job_plan_steps')
        .select('id,title,instructions,control_requirement,estimated_minutes')
        .eq('organization_id', context.organizationId)
        .eq('plan_id', planId)
        .eq('id', stepId)
        .maybeSingle();
      if (!currentStep) return NextResponse.json({ error: 'Paso no encontrado.' }, { status: 404 });
      const { count } = await context.supabase
        .from('maintenance_standard_job_plan_steps')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .eq('plan_id', planId);
      if ((count || 0) <= 1) return NextResponse.json({ error: 'El plan debe conservar al menos un paso.' }, { status: 409 });
      const { error } = await context.supabase
        .from('maintenance_standard_job_plan_steps')
        .delete()
        .eq('organization_id', context.organizationId)
        .eq('plan_id', planId)
        .eq('id', stepId);
      if (error) throw error;
      await context.supabase.from('audit_log').insert({
        organization_id: context.organizationId,
        user_id: context.userId,
        action: 'maintenance_standard_plan_edited',
        resource_type: 'maintenance_standard_job_plan',
        resource_id: planId,
        resource_identifier: plan.plan_code || planId,
        old_values: { step: currentStep },
        new_values: { edit_type: 'remove_step', proposal_source: plan.proposed_by ? 'human' : 'motil' },
        user_agent: request.headers.get('user-agent'),
        status: 'completed',
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'add_material') {
      if (plan.status !== 'proposed') return NextResponse.json({ error: 'Sólo se editan planes propuestos.' }, { status: 409 });
      const productCode = text(body?.productCode);
      const quantity = num(body?.quantityRequired);
      if (!productCode || !Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'Indica producto canónico y cantidad válida.' }, { status: 400 });
      const canonical = context.supabase.schema('canonical');
      const { data: product } = await canonical.from('products').select('id,product_code,name').eq('organization_id', context.organizationId).eq('product_code', productCode).maybeSingle();
      if (!product) return NextResponse.json({ error: `Producto canónico no encontrado: ${productCode}` }, { status: 404 });
      const newMaterial = {
        organization_id: context.organizationId,
        plan_id: planId,
        canonical_product_id: product.id,
        quantity_required: quantity,
        notes: text(body?.notes) || null,
      };
      const { data: insertedMaterial, error } = await context.supabase
        .from('maintenance_standard_job_plan_materials')
        .insert(newMaterial)
        .select('id')
        .single();
      if (error) throw error;
      await context.supabase.from('audit_log').insert({
        organization_id: context.organizationId,
        user_id: context.userId,
        action: 'maintenance_standard_plan_edited',
        resource_type: 'maintenance_standard_job_plan',
        resource_id: planId,
        resource_identifier: plan.plan_code || planId,
        new_values: {
          edit_type: 'add_material',
          material_id: insertedMaterial.id,
          canonical_product_id: product.id,
          quantity_required: quantity,
          proposal_source: plan.proposed_by ? 'human' : 'motil',
        },
        user_agent: request.headers.get('user-agent'),
        status: 'completed',
      });
      return NextResponse.json({ ok: true, product, materialId: insertedMaterial.id });
    }

    if (action === 'update_material') {
      if (plan.status !== 'proposed') return NextResponse.json({ error: 'Sólo se editan planes propuestos.' }, { status: 409 });
      const materialId = text(body?.materialId);
      const quantity = num(body?.quantityRequired);
      if (!materialId || !Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'Material y cantidad válida son obligatorios.' }, { status: 400 });
      const { data: currentMaterial } = await context.supabase
        .from('maintenance_standard_job_plan_materials')
        .select('id,canonical_product_id,quantity_required,notes')
        .eq('organization_id', context.organizationId)
        .eq('plan_id', planId)
        .eq('id', materialId)
        .maybeSingle();
      if (!currentMaterial) return NextResponse.json({ error: 'Material no encontrado.' }, { status: 404 });
      const nextValues = {
        quantity_required: quantity,
        notes: text(body?.notes) || null,
      };
      const { error } = await context.supabase
        .from('maintenance_standard_job_plan_materials')
        .update(nextValues)
        .eq('organization_id', context.organizationId)
        .eq('plan_id', planId)
        .eq('id', materialId);
      if (error) throw error;
      await context.supabase.from('audit_log').insert({
        organization_id: context.organizationId,
        user_id: context.userId,
        action: 'maintenance_standard_plan_edited',
        resource_type: 'maintenance_standard_job_plan',
        resource_id: planId,
        resource_identifier: plan.plan_code || planId,
        old_values: { material: currentMaterial },
        new_values: { edit_type: 'update_material', material: nextValues, proposal_source: plan.proposed_by ? 'human' : 'motil' },
        user_agent: request.headers.get('user-agent'),
        status: 'completed',
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'remove_material') {
      if (plan.status !== 'proposed') return NextResponse.json({ error: 'Sólo se editan planes propuestos.' }, { status: 409 });
      const materialId = text(body?.materialId);
      if (!materialId) return NextResponse.json({ error: 'Falta materialId.' }, { status: 400 });
      const { data: currentMaterial } = await context.supabase
        .from('maintenance_standard_job_plan_materials')
        .select('id,canonical_product_id,quantity_required,notes')
        .eq('organization_id', context.organizationId)
        .eq('plan_id', planId)
        .eq('id', materialId)
        .maybeSingle();
      if (!currentMaterial) return NextResponse.json({ error: 'Material no encontrado.' }, { status: 404 });
      const { error } = await context.supabase
        .from('maintenance_standard_job_plan_materials')
        .delete()
        .eq('organization_id', context.organizationId)
        .eq('plan_id', planId)
        .eq('id', materialId);
      if (error) throw error;
      await context.supabase.from('audit_log').insert({
        organization_id: context.organizationId,
        user_id: context.userId,
        action: 'maintenance_standard_plan_edited',
        resource_type: 'maintenance_standard_job_plan',
        resource_id: planId,
        resource_identifier: plan.plan_code || planId,
        old_values: { material: currentMaterial },
        new_values: { edit_type: 'remove_material', proposal_source: plan.proposed_by ? 'human' : 'motil' },
        user_agent: request.headers.get('user-agent'),
        status: 'completed',
      });
      return NextResponse.json({ ok: true });
    }

    if (action === 'approve') {
      const { data, error } = await context.supabase.rpc('approve_standard_job_plan_v1', { p_plan_id: planId });
      if (error) throw error;
      return NextResponse.json({ ok: true, planId: data });
    }

    return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo actualizar el plan estándar.' }, { status: 500 });
  }
}
