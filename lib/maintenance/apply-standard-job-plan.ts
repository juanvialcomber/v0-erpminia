type ApplyInput = {
  supabase: any;
  organizationId: string;
  userId: string;
  planId: string;
  workOrderId: string;
};

export async function applyStandardJobPlanToWorkOrder(input: ApplyInput) {
  const { supabase, organizationId, userId, planId, workOrderId } = input;
  const canonical = supabase.schema('canonical');

  const [{ data: plan, error: planError }, { data: workOrder, error: workOrderError }] = await Promise.all([
    supabase.from('maintenance_standard_job_plans').select('id,plan_code,name,status,canonical_asset_id').eq('organization_id', organizationId).eq('id', planId).maybeSingle(),
    supabase.from('maintenance_work_orders').select('id,canonical_asset_id,status').eq('organization_id', organizationId).eq('id', workOrderId).maybeSingle(),
  ]);
  if (planError) throw planError;
  if (workOrderError) throw workOrderError;
  if (!plan || plan.status !== 'approved') throw new Error('El plan estándar debe estar aprobado antes de aplicarlo.');
  if (!workOrder) throw new Error('La orden de trabajo no existe en la organización activa.');
  if (plan.canonical_asset_id && plan.canonical_asset_id !== workOrder.canonical_asset_id) throw new Error('El plan estándar está aprobado para otro equipo.');

  const { data: planSteps, error: planStepsError } = await supabase
    .from('maintenance_standard_job_plan_steps')
    .select('title,instructions,control_requirement')
    .eq('organization_id', organizationId)
    .eq('plan_id', planId);
  if (planStepsError) throw planStepsError;

  const declaredNonOperational = (planSteps || []).some((step: any) => {
    const text = [step.title, step.instructions, step.control_requirement]
      .filter(Boolean)
      .join(' ')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return text.includes('uat controlado')
      || text.includes('no representa una intervencion real de terreno')
      || text.includes('solo para pruebas')
      || text.includes('test only');
  });
  if (declaredNonOperational) {
    throw new Error('El plan estándar está marcado como UAT/prueba y no puede aplicarse a una OT operacional.');
  }

  const { data: activeApplication, error: applicationReadError } = await supabase
    .from('maintenance_standard_job_plan_applications')
    .select('id,plan_id')
    .eq('organization_id', organizationId)
    .eq('work_order_id', workOrderId)
    .eq('status', 'active')
    .maybeSingle();
  if (applicationReadError) throw applicationReadError;
  if (activeApplication && activeApplication.plan_id !== planId) throw new Error('La orden ya tiene otro plan estándar activo.');

  if (!activeApplication) {
    const { error } = await supabase.from('maintenance_standard_job_plan_applications').insert({
      organization_id: organizationId,
      plan_id: planId,
      work_order_id: workOrderId,
      status: 'active',
      applied_by: userId,
      applied_at: new Date().toISOString(),
    });
    if (error) throw error;
  }

  const { data: materials, error: materialsError } = await supabase
    .from('maintenance_standard_job_plan_materials')
    .select('canonical_product_id,quantity_required,notes')
    .eq('organization_id', organizationId)
    .eq('plan_id', planId);
  if (materialsError) throw materialsError;
  if (!materials?.length) return { createdRequirements: 0 };

  const productIds = materials.map((row: any) => row.canonical_product_id);
  const [{ data: existing, error: existingError }, { data: inventory, error: inventoryError }] = await Promise.all([
    supabase.from('work_order_material_requirements').select('canonical_product_id').eq('organization_id', organizationId).eq('work_order_id', workOrderId).in('canonical_product_id', productIds),
    supabase.from('canonical_inventory_current').select('product_id,quantity').eq('organization_id', organizationId).in('product_id', productIds),
  ]);
  if (existingError) throw existingError;
  if (inventoryError) throw inventoryError;

  const existingIds = new Set((existing || []).map((row: any) => row.canonical_product_id));
  const inventoryByProduct = new Map((inventory || []).map((row: any) => [row.product_id, Number(row.quantity || 0)]));
  const inserts = materials.filter((row: any) => !existingIds.has(row.canonical_product_id)).map((row: any) => {
    const required = Number(row.quantity_required || 0);
    const available = Number(inventoryByProduct.get(row.canonical_product_id) || 0);
    const shortage = Math.max(0, required - available);
    return {
      organization_id: organizationId,
      work_order_id: workOrderId,
      canonical_asset_id: workOrder.canonical_asset_id,
      canonical_product_id: row.canonical_product_id,
      quantity_required: required,
      quantity_available: available,
      quantity_shortage: shortage,
      status: shortage > 0 ? 'procurement_needed' : 'covered',
      notes: row.notes ? `${row.notes} · Plan estándar ${plan.plan_code}` : `Plan estándar ${plan.plan_code}`,
      created_by: userId,
    };
  });
  if (inserts.length) {
    const { error } = await supabase.from('work_order_material_requirements').insert(inserts);
    if (error) throw error;
  }

  return { createdRequirements: inserts.length };
}
