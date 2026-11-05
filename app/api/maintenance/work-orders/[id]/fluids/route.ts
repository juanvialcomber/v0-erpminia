export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';

function numberOrNull(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  const execution = await requireAssignedMaintenanceExecution(context, id);
  if (level !== 'ED' && level !== 'LEC' && !execution.ok) {
    return NextResponse.json({ error: 'Sin acceso al uso de fluidos de esta OT.' }, { status: 403 });
  }

  const { data, error } = await context.supabase
    .from('maintenance_fluid_usage_records')
    .select('*')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .order('used_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const usageRows = data || [];
  const { data: linkEvents, error: linkError } = await context.supabase
    .from('work_order_events')
    .select('source_record_id,payload')
    .eq('organization_id', context.organizationId)
    .eq('work_order_id', id)
    .eq('event_type', 'waste_generated')
    .eq('source_table', 'maintenance_waste_records')
    .limit(5000);

  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });
  const wasteIds = Array.from(new Set((linkEvents || []).map((row) => row.source_record_id).filter(Boolean)));
  const wasteResult = wasteIds.length
    ? await context.supabase
        .from('maintenance_waste_records')
        .select('id,waste_code,waste_name,quantity,unit,status,classification,storage_location,destination_name')
        .eq('organization_id', context.organizationId)
        .eq('work_order_id', id)
        .in('id', wasteIds)
    : { data: [], error: null };
  if (wasteResult.error) return NextResponse.json({ error: wasteResult.error.message }, { status: 500 });

  const wasteById = new Map((wasteResult.data || []).map((row) => [row.id, row]));
  const wasteByUsage = new Map<string, any>();
  for (const event of linkEvents || []) {
    const usageId = String((event.payload as any)?.source_fluid_usage_id || '');
    const waste = wasteById.get(event.source_record_id);
    if (usageId && waste) wasteByUsage.set(usageId, waste);
  }

  return NextResponse.json({
    rows: usageRows.map((row) => ({ ...row, linked_waste: wasteByUsage.get(String(row.id)) || null })),
    canEdit: execution.ok,
  });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
  if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });
  const execution = await requireAssignedMaintenanceExecution(context, id);
  if (!execution.ok) return execution.response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });

  const quantityLiters = numberOrNull(body.quantity_liters);
  if (quantityLiters === null || quantityLiters <= 0) {
    return NextResponse.json({ error: 'Los litros usados deben ser mayores que cero.' }, { status: 400 });
  }

  const recoveredWasteLiters = body.recovered_waste_liters === '' || body.recovered_waste_liters == null
    ? null
    : numberOrNull(body.recovered_waste_liters);
  if (recoveredWasteLiters !== null && recoveredWasteLiters <= 0) {
    return NextResponse.json({ error: 'Los litros de residuo recuperado deben ser mayores que cero.' }, { status: 400 });
  }
  const allowedLinkedWasteCodes = new Set(['used_oil','hydraulic_fluid','coolant','brake_fluid']);
  const linkedWasteCode = String(body.linked_waste_code || 'used_oil').trim();
  if (recoveredWasteLiters !== null && !allowedLinkedWasteCodes.has(linkedWasteCode)) {
    return NextResponse.json({ error: 'Tipo de residuo líquido no válido.' }, { status: 400 });
  }

  const { data: order, error: orderError } = await context.supabase
    .from('maintenance_work_orders')
    .select('canonical_asset_id,asset_id')
    .eq('organization_id', context.organizationId)
    .eq('id', id)
    .single();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });

  const canonicalAssetId = order.canonical_asset_id || order.asset_id;
  if (!canonicalAssetId) return NextResponse.json({ error: 'La OT no tiene equipo canónico asociado.' }, { status: 409 });

  let fluidName = String(body.fluid_name || '').trim();
  let canonicalProductId = body.canonical_product_id ? String(body.canonical_product_id) : null;
  let inventoryUnit: string | null = null;
  let unitCostSnapshot: number | null = null;
  let warehouseCode: string | null = body.warehouse_code ? String(body.warehouse_code) : null;
  let totalCost: number | null = null;
  let costState: 'source' | 'derived' | 'unavailable' = 'unavailable';

  if (canonicalProductId) {
    let productQuery = context.supabase
      .from('inventory_intelligence_position_v1')
      .select('product_id,product_name,unit,unit_cost,warehouse_code')
      .eq('organization_id', context.organizationId)
      .eq('product_id', canonicalProductId)
      .eq('family', 'Lubricante');
    if (warehouseCode) productQuery = productQuery.eq('warehouse_code', warehouseCode);
    const { data: products, error: productError } = await productQuery.limit(1);
    if (productError) return NextResponse.json({ error: productError.message }, { status: 500 });
    const product = products?.[0];
    if (!product) return NextResponse.json({ error: 'Lubricante no encontrado en Bodega.' }, { status: 404 });

    fluidName = product.product_name || fluidName;
    inventoryUnit = product.unit || null;
    unitCostSnapshot = numberOrNull(product.unit_cost);
    warehouseCode = product.warehouse_code || warehouseCode;

    const inventoryUnitsUsed = numberOrNull(body.inventory_units_used);
    const normalizedUnit = String(inventoryUnit || '').toLowerCase();
    if (unitCostSnapshot !== null && normalizedUnit.includes('litro')) {
      totalCost = quantityLiters * unitCostSnapshot;
      costState = 'derived';
    } else if (unitCostSnapshot !== null && inventoryUnitsUsed !== null && inventoryUnitsUsed > 0) {
      totalCost = inventoryUnitsUsed * unitCostSnapshot;
      costState = 'derived';
    }
  }

  if (!fluidName) return NextResponse.json({ error: 'Indica el fluido utilizado.' }, { status: 400 });

  const inventoryUnitsUsed = numberOrNull(body.inventory_units_used);
  const wasteNames: Record<string, string> = {
    used_oil: 'Aceite usado',
    hydraulic_fluid: 'Fluido hidráulico usado',
    coolant: 'Refrigerante / anticongelante usado',
    brake_fluid: 'Líquido de frenos usado',
  };
  const { data, error } = await context.supabase.rpc('record_work_order_fluid_usage_v1', {
    p_organization_id: context.organizationId,
    p_work_order_id: id,
    p_canonical_asset_id: canonicalAssetId,
    p_canonical_product_id: canonicalProductId,
    p_fluid_name: fluidName,
    p_quantity_liters: quantityLiters,
    p_inventory_units_used: inventoryUnitsUsed && inventoryUnitsUsed > 0 ? inventoryUnitsUsed : null,
    p_inventory_unit: inventoryUnit,
    p_unit_cost_snapshot: unitCostSnapshot,
    p_total_cost: totalCost,
    p_cost_state: costState,
    p_warehouse_code: warehouseCode,
    p_notes: body.notes ? String(body.notes).trim() : null,
    p_actor_id: context.authUserId,
    p_actor_name: context.userName || context.userEmail || null,
    p_recovered_waste_liters: recoveredWasteLiters,
    p_waste_code: recoveredWasteLiters !== null ? linkedWasteCode : null,
    p_waste_name: recoveredWasteLiters !== null ? (wasteNames[linkedWasteCode] || 'Residuo líquido usado') : null,
    p_waste_storage_location: body.waste_storage_location ? String(body.waste_storage_location).trim() : null,
    p_waste_notes: body.waste_notes ? String(body.waste_notes).trim() : null,
  });

  if (error) {
    const code = (error as { code?: string }).code;
    const status = code === '22023' ? 400 : code === '55000' || code === 'P0001' ? 409 : 500;
    return NextResponse.json({ error: error.message || 'No se pudo registrar el uso de fluido.' }, { status });
  }

  const fluid = (data as any)?.fluid || null;
  const waste = (data as any)?.waste || null;
  return NextResponse.json({
    data: fluid ? { ...fluid, linked_waste: waste } : null,
    linkedWasteCreated: Boolean((data as any)?.linked_waste_created),
    inventoryMutated: false,
    note: 'El registro no descuenta stock de Bodega; la conciliación con movimientos se gestiona por separado.',
  }, { status: 201 });
}
