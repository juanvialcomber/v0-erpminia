export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

type MaterialInput = {
  canonicalProductId: string;
  quantityRequired: number;
  requiredDate?: string | null;
  notes?: string | null;
};

export async function GET(request: NextRequest, contextRoute: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { id } = await contextRoute.params;
    const [{ data, error }, { data: receiptMovements, error: receiptError }] = await Promise.all([
      context.supabase.rpc('get_work_order_supply_status_v1', {
        p_organization_id: context.organizationId,
        p_work_order_id: id,
      }),
      context.supabase
        .from('stock_movements')
        .select('canonical_product_id,quantity,reference_doc,reference_id,created_at')
        .eq('organization_id', context.organizationId)
        .eq('work_order_id', id)
        .eq('movement_type', 'receipt')
        .eq('reference_doc', 'operational_receipt'),
    ]);
    if (error) throw error;
    if (receiptError) throw receiptError;

    const purchasedReceivedByProduct = new Map<string, number>();
    for (const movement of receiptMovements || []) {
      if (!movement.canonical_product_id) continue;
      purchasedReceivedByProduct.set(
        movement.canonical_product_id,
        (purchasedReceivedByProduct.get(movement.canonical_product_id) || 0) + Number(movement.quantity || 0),
      );
    }

    const status = data && typeof data === 'object' ? { ...data } : data;
    if (status && typeof status === 'object' && Array.isArray((status as any).materials)) {
      (status as any).materials = (status as any).materials.map((row: any) => ({
        ...row,
        purchase_received: row.product_id ? Number(purchasedReceivedByProduct.get(row.product_id) || 0) : 0,
      }));
      (status as any).purchase_received_units = Array.from(purchasedReceivedByProduct.values()).reduce((sum, value) => sum + value, 0);
    }

    return NextResponse.json({ data: status });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la cobertura de materiales';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, contextRoute: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { id } = await contextRoute.params;
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const item = (await request.json()) as MaterialInput;
    if (!item.canonicalProductId || !Number.isFinite(Number(item.quantityRequired)) || Number(item.quantityRequired) <= 0) {
      return NextResponse.json({ error: 'Producto y cantidad requerida son obligatorios' }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc('upsert_work_order_material_requirement_v1', {
      p_work_order_id: id,
      p_canonical_product_id: item.canonicalProductId,
      p_quantity_required: Number(item.quantityRequired),
      p_required_date: item.requiredDate || null,
      p_notes: item.notes?.trim() || null,
    });
    if (error) throw error;

    return NextResponse.json({
      supplyNeedId: data?.supply_need_id || null,
      requirementId: data?.requirement_id || null,
      data: data?.supply_status || null,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo agregar el material requerido';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, contextRoute: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { id } = await contextRoute.params;
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const body = (await request.json()) as { materials?: MaterialInput[] };
    const materials = Array.isArray(body.materials) ? body.materials : [];

    for (const item of materials) {
      if (!item.canonicalProductId || !Number.isFinite(Number(item.quantityRequired)) || Number(item.quantityRequired) <= 0) {
        return NextResponse.json({ error: 'Producto y cantidad requerida son obligatorios' }, { status: 400 });
      }
    }

    const { data, error } = await context.supabase.rpc('replace_work_order_material_requirements_v1', {
      p_organization_id: context.organizationId,
      p_work_order_id: id,
      p_materials: materials.map((item) => ({
        canonicalProductId: item.canonicalProductId,
        quantityRequired: Number(item.quantityRequired),
        requiredDate: item.requiredDate || null,
        notes: item.notes?.trim() || null,
      })),
    });
    if (error) throw error;

    return NextResponse.json({
      supplyNeedId: data?.supply_need_id || null,
      data: data?.supply_status || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron actualizar los materiales requeridos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
