export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (level !== 'ED' && level !== 'LEC') {
    return NextResponse.json({ error: 'Sin acceso a planes de lubricación.' }, { status: 403 });
  }

  const [plansResult, schedulesResult] = await Promise.all([
    context.supabase
      .from('maintenance_fluid_plans')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('active', true)
      .order('created_at', { ascending: false }),
    context.supabase
      .from('preventive_maintenance_schedules')
      .select('id,canonical_asset_id,asset_id,task_name,frequency_days,frequency_hours,next_scheduled_date,current_meter_snapshot,next_due_meter,meter_unit,enabled,source_reference')
      .eq('organization_id', context.organizationId)
      .eq('enabled', true)
      .order('task_name', { ascending: true }),
  ]);

  if (plansResult.error) return NextResponse.json({ error: plansResult.error.message }, { status: 500 });
  if (schedulesResult.error) return NextResponse.json({ error: schedulesResult.error.message }, { status: 500 });

  return NextResponse.json({
    plans: plansResult.data || [],
    schedules: schedulesResult.data || [],
    canEdit: level === 'ED',
  });
}

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (level !== 'ED') {
    return NextResponse.json({ error: 'Sólo planificación puede configurar consumos esperados.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });

  const scheduleId = String(body.preventive_schedule_id || '').trim();
  const plannedInputLiters = numberOrNull(body.planned_input_liters);
  const plannedWasteLiters = body.planned_waste_liters === '' || body.planned_waste_liters == null
    ? null
    : numberOrNull(body.planned_waste_liters);
  const litersPerInventoryUnit = body.liters_per_inventory_unit === '' || body.liters_per_inventory_unit == null
    ? null
    : numberOrNull(body.liters_per_inventory_unit);

  if (!scheduleId) return NextResponse.json({ error: 'Selecciona un plan preventivo.' }, { status: 400 });
  if (plannedInputLiters === null || plannedInputLiters <= 0) {
    return NextResponse.json({ error: 'Los litros planificados deben ser mayores que cero.' }, { status: 400 });
  }
  if (plannedWasteLiters !== null && plannedWasteLiters < 0) {
    return NextResponse.json({ error: 'El residuo esperado no puede ser negativo.' }, { status: 400 });
  }
  if (litersPerInventoryUnit !== null && litersPerInventoryUnit <= 0) {
    return NextResponse.json({ error: 'La conversión de Bodega debe ser mayor que cero.' }, { status: 400 });
  }

  const { data: schedule, error: scheduleError } = await context.supabase
    .from('preventive_maintenance_schedules')
    .select('id,canonical_asset_id,asset_id')
    .eq('organization_id', context.organizationId)
    .eq('id', scheduleId)
    .single();

  if (scheduleError) return NextResponse.json({ error: 'Plan preventivo no encontrado.' }, { status: 404 });
  const canonicalAssetId = schedule.canonical_asset_id || schedule.asset_id;
  if (!canonicalAssetId) return NextResponse.json({ error: 'El plan preventivo no tiene equipo canónico.' }, { status: 409 });

  const productId = body.canonical_product_id ? String(body.canonical_product_id) : null;
  let fluidName = String(body.fluid_name || '').trim();

  if (productId) {
    const { data: productRows, error: productError } = await context.supabase
      .from('inventory_intelligence_position_v1')
      .select('product_id,product_name')
      .eq('organization_id', context.organizationId)
      .eq('product_id', productId)
      .eq('family', 'Lubricante')
      .limit(1);
    if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
    if (!productRows?.[0]) return NextResponse.json({ error: 'Lubricante no encontrado en Bodega.' }, { status: 404 });
    fluidName = productRows[0].product_name || fluidName;
  }

  if (!fluidName) return NextResponse.json({ error: 'Indica el fluido planificado.' }, { status: 400 });

  const { data, error } = await context.supabase
    .from('maintenance_fluid_plans')
    .upsert({
      organization_id: context.organizationId,
      preventive_schedule_id: scheduleId,
      canonical_asset_id: canonicalAssetId,
      canonical_product_id: productId,
      fluid_name: fluidName,
      planned_input_liters: plannedInputLiters,
      planned_waste_liters: plannedWasteLiters,
      liters_per_inventory_unit: litersPerInventoryUnit,
      source_reference: body.source_reference ? String(body.source_reference).trim() : null,
      active: true,
      created_by: context.authUserId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'organization_id,preventive_schedule_id,canonical_product_id,fluid_name',
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
