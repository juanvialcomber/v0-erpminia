export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

const LA_PATAGUA_ORGANIZATION_ID = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';

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
    const { data, error } = await context.supabase.rpc('get_work_order_supply_status_v1', {
      p_organization_id: context.organizationId,
      p_work_order_id: id,
    });
    if (error) throw error;

    const materials = Array.isArray(data?.materials) ? data.materials : [];
    if (context.organizationId !== LA_PATAGUA_ORGANIZATION_ID || materials.length === 0) {
      return NextResponse.json({ data });
    }

    const skus = [...new Set(
      materials
        .map((row: any) => String(row.product_code || '').trim())
        .filter(Boolean),
    )];

    if (skus.length === 0) return NextResponse.json({ data });

    const { data: bodegaRows, error: bodegaError } = await context.supabase
      .from('bodega_inventory')
      .select('sku,quantity,quantity_reported,updated_at')
      .in('sku', skus);
    if (bodegaError) throw bodegaError;

    const informedBySku = new Map(
      (bodegaRows || []).map((row: any) => {
        const reported = row.quantity_reported == null ? null : Number(row.quantity_reported);
        const informed = Number.isFinite(reported) ? reported : Number(row.quantity || 0);
        return [String(row.sku || '').trim().toUpperCase(), {
          informedAvailable: informed,
          informedUpdatedAt: row.updated_at || null,
        }];
      }),
    );

    return NextResponse.json({
      data: {
        ...data,
        materials: materials.map((row: any) => {
          const signal = informedBySku.get(String(row.product_code || '').trim().toUpperCase()) || null;
          return {
            ...row,
            informed_available: signal?.informedAvailable ?? null,
            informed_updated_at: signal?.informedUpdatedAt ?? null,
            informed_source: signal ? 'bodega_inventory' : null,
          };
        }),
        stock_signal_role: 'advisory_confirmation_before_procurement',
      },
    });
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
