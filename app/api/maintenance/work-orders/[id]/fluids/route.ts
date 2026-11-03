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

async function canWrite(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, workOrderId: string) {
  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (level === 'ED') return true;
  const execution = await requireAssignedMaintenanceExecution(context, workOrderId);
  return execution.ok;
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
  return NextResponse.json({ rows: data || [], canEdit: level === 'ED' || execution.ok });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
  if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });
  if (!(await canWrite(context, id))) {
    return NextResponse.json({ error: 'No autorizado para registrar fluidos en esta OT.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });

  const quantityLiters = numberOrNull(body.quantity_liters);
  if (quantityLiters === null || quantityLiters <= 0) {
    return NextResponse.json({ error: 'Los litros usados deben ser mayores que cero.' }, { status: 400 });
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
  const { data, error } = await context.supabase
    .from('maintenance_fluid_usage_records')
    .insert({
      organization_id: context.organizationId,
      work_order_id: id,
      canonical_asset_id: canonicalAssetId,
      canonical_product_id: canonicalProductId,
      fluid_name: fluidName,
      quantity_liters: quantityLiters,
      inventory_units_used: inventoryUnitsUsed && inventoryUnitsUsed > 0 ? inventoryUnitsUsed : null,
      inventory_unit: inventoryUnit,
      unit_cost_snapshot: unitCostSnapshot,
      total_cost: totalCost,
      cost_state: costState,
      source_type: 'manual',
      warehouse_code: warehouseCode,
      validation_status: 'reported',
      notes: body.notes ? String(body.notes).trim() : null,
      created_by: context.authUserId,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await context.supabase.from('work_order_events').insert({
    organization_id: context.organizationId,
    work_order_id: id,
    canonical_asset_id: canonicalAssetId,
    event_type: 'fluid_usage_reported',
    event_at: new Date().toISOString(),
    actor_id: context.authUserId,
    actor_name: context.userName || context.userEmail || null,
    source_table: 'maintenance_fluid_usage_records',
    source_record_id: data.id,
    summary: 'Uso de fluido registrado',
    payload: { fluid_name: fluidName, quantity_liters: quantityLiters, cost_state: costState },
  });

  return NextResponse.json({
    data,
    inventoryMutated: false,
    note: 'El registro no descuenta stock de Bodega; la conciliación con movimientos se gestiona por separado.',
  }, { status: 201 });
}
