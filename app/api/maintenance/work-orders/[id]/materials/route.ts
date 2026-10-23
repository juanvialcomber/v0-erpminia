export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

async function authorizeWrite(request: NextRequest, workOrderId: string) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context;
  const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (accessLevel === 'ED') return context;
  const assigned = await requireAssignedMaintenanceExecution(context, workOrderId);
  if (!assigned.ok) return { ok: false as const, response: assigned.response };
  return context;
}

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
    const [{ data, error }, { data: workOrder, error: workOrderError }] = await Promise.all([
      context.supabase.rpc('get_work_order_supply_status_v1', {
        p_organization_id: context.organizationId,
        p_work_order_id: id,
      }),
      context.supabase
        .from('maintenance_work_orders')
        .select('materials_required,materials_reviewed_at,materials_reviewed_by')
        .eq('organization_id', context.organizationId)
        .eq('id', id)
        .maybeSingle(),
    ]);
    if (error) throw error;
    if (workOrderError) throw workOrderError;
    return NextResponse.json({
      data,
      materialDeclaration: workOrder ? {
        requiresMaterials: workOrder.materials_required,
        reviewedAt: workOrder.materials_reviewed_at,
        reviewedBy: workOrder.materials_reviewed_by,
      } : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la cobertura de materiales';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, contextRoute: { params: Promise<{ id: string }> }) {
  const { id } = await contextRoute.params;
  const context = await authorizeWrite(request, id);
  if (!context.ok) return context.response;

  try {
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const item = (await request.json()) as MaterialInput;
    if (!item.canonicalProductId || !Number.isFinite(Number(item.quantityRequired)) || Number(item.quantityRequired) <= 0) {
      return NextResponse.json({ error: 'Producto y cantidad requerida son obligatorios' }, { status: 400 });
    }

    const { error: declarationError } = await context.supabase.rpc('declare_work_order_materials_v1', {
      p_organization_id: context.organizationId,
      p_work_order_id: id,
      p_requires_materials: true,
    });
    if (declarationError) throw declarationError;

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
      materialDeclaration: { requiresMaterials: true },
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

    if (materials.length > 0) {
      const { error: declarationError } = await context.supabase.rpc('declare_work_order_materials_v1', {
        p_organization_id: context.organizationId,
        p_work_order_id: id,
        p_requires_materials: true,
      });
      if (declarationError) throw declarationError;
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


export async function PATCH(request: NextRequest, contextRoute: { params: Promise<{ id: string }> }) {
  const { id } = await contextRoute.params;
  const context = await authorizeWrite(request, id);
  if (!context.ok) return context.response;

  try {
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const body = (await request.json().catch(() => null)) as { requiresMaterials?: boolean } | null;
    if (typeof body?.requiresMaterials !== 'boolean') {
      return NextResponse.json({ error: 'Debes indicar si la OT requiere materiales.' }, { status: 400 });
    }

    const { data, error } = await context.supabase.rpc('declare_work_order_materials_v1', {
      p_organization_id: context.organizationId,
      p_work_order_id: id,
      p_requires_materials: body.requiresMaterials,
    });
    if (error) throw error;

    return NextResponse.json({ materialDeclaration: {
      requiresMaterials: data?.materials_required ?? body.requiresMaterials,
      reviewedAt: data?.materials_reviewed_at || new Date().toISOString(),
    }});
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo guardar la declaración de materiales';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
