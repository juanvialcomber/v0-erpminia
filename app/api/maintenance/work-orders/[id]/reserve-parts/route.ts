export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getMaintenanceWorkOrderScope, requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

type PartActionPayload = {
  action?: 'issue_reserved' | 'install' | 'return';
  partRecordId?: string;
  partId?: string;
  quantity?: number | string;
  notes?: string | null;
};

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const { id: workOrderId } = await params;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, workOrderId);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const body = (await request.json()) as PartActionPayload;

    if (body.action === 'issue_reserved') {
      const { data, error } = await context.supabase.rpc('issue_available_materials_to_work_order_v2', {
        p_organization_id: context.organizationId,
        p_work_order_id: workOrderId,
      });
      if (error) throw error;
      return NextResponse.json({ data, issuedReserved: true }, { status: 201 });
    }

    const quantity = Number(body.quantity || 0);
    if (!body.partId || !Number.isInteger(quantity) || quantity <= 0) return NextResponse.json({ error: 'Selecciona un repuesto y una cantidad entera mayor que cero' }, { status: 400 });

    const { data, error } = await context.supabase.rpc('issue_work_order_part', {
      p_work_order_id: workOrderId,
      p_warehouse_stock_id: body.partId,
      p_quantity: quantity,
      p_notes: body.notes || null,
    });
    if (error) throw error;
    return NextResponse.json({ data: { id: data }, issued: true }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo entregar el repuesto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const { id: workOrderId } = await params;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, workOrderId);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const body = (await request.json()) as PartActionPayload;
    const quantity = Number(body.quantity || 0);
    if (!body.partRecordId || !Number.isInteger(quantity) || quantity <= 0) return NextResponse.json({ error: 'Selecciona un repuesto entregado y una cantidad entera mayor que cero' }, { status: 400 });

    if (body.action === 'return') {
      const { data, error } = await context.supabase.rpc('return_work_order_part', {
        p_organization_id: context.organizationId,
        p_work_order_id: workOrderId,
        p_part_record_id: body.partRecordId,
        p_quantity: quantity,
        p_notes: body.notes || null,
      });
      if (error) throw error;
      return NextResponse.json({ data: { movementId: data }, returned: true });
    }

    const { data: current, error: currentError } = await context.supabase.from('work_order_parts')
      .select('id, quantity_issued, quantity_installed, quantity_returned')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', workOrderId)
      .eq('id', body.partRecordId)
      .maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: 'El repuesto no pertenece a esta orden' }, { status: 404 });

    const issued = Number(current.quantity_issued || 0);
    const installed = Number(current.quantity_installed || 0);
    const returned = Number(current.quantity_returned || 0);
    const availableToInstall = Math.max(0, issued - installed - returned);
    if (quantity > availableToInstall) return NextResponse.json({ error: `Solo quedan ${availableToInstall} unidades entregadas por confirmar` }, { status: 409 });

    const nextInstalled = installed + quantity;
    const nextStatus = nextInstalled + returned >= issued ? 'installed' : 'issued';
    const { data, error } = await context.supabase.from('work_order_parts').update({
      quantity_installed: nextInstalled,
      status: nextStatus,
      installed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('organization_id', context.organizationId).eq('work_order_id', workOrderId).eq('id', body.partRecordId)
      .select('id, quantity_issued, quantity_installed, quantity_returned, status, unit_cost, total_cost').single();
    if (error) throw error;
    return NextResponse.json({ data, installed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar el repuesto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const { id: workOrderId } = await params;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const scope = await getMaintenanceWorkOrderScope(context.supabase, context.organizationId, workOrderId);
    if (scope === 'missing') return NextResponse.json({ error: 'No se encontró la orden de trabajo' }, { status: 404 });

    const [{ data: parts, error: partsError }, { data: movements, error: movementError }, costResult] = await Promise.all([
      context.supabase.from('work_order_parts').select('id, canonical_product_id, warehouse_stock_id, quantity_requested, quantity_reserved, quantity_issued, quantity_installed, quantity_returned, unit_cost, total_cost, status, notes, created_at').eq('organization_id', context.organizationId).eq('work_order_id', workOrderId).order('created_at', { ascending: false }),
      context.supabase.from('stock_movements').select('id, stock_id, movement_type, quantity, unit_cost, total_cost, notes, created_at').eq('organization_id', context.organizationId).eq('work_order_id', workOrderId).order('created_at', { ascending: false }),
      context.supabase.rpc('get_work_order_cost_summary', { p_organization_id: context.organizationId, p_work_order_id: workOrderId }),
    ]);
    if (partsError) throw partsError;
    if (movementError) throw movementError;
    if (costResult.error) throw costResult.error;

    const productIds = [...new Set((parts || []).map((row) => row.canonical_product_id).filter(Boolean))];
    const stockIds = [...new Set([...(parts || []).map((row) => row.warehouse_stock_id), ...(movements || []).map((row) => row.stock_id)].filter(Boolean))];
    const [{ data: products }, { data: stock }] = await Promise.all([
      productIds.length ? context.supabase.schema('canonical').from('products').select('id, product_code, name, unit').in('id', productIds) : Promise.resolve({ data: [] }),
      stockIds.length ? context.supabase.from('warehouse_stock').select('id, part_code, part_name, quantity_on_hand, quantity_available, unit_cost').in('id', stockIds) : Promise.resolve({ data: [] }),
    ]);

    const productMap = new Map((products || []).map((item) => [item.id, item]));
    const stockMap = new Map((stock || []).map((item) => [item.id, item]));
    const normalizedParts = (parts || []).map((row) => ({ ...row, quantity: row.quantity_issued, part: productMap.get(row.canonical_product_id) || stockMap.get(row.warehouse_stock_id) || null }));
    const summary = Array.isArray(costResult.data) ? costResult.data[0] : costResult.data;
    const counts = normalizedParts.reduce((acc, row) => ({ issued: acc.issued + Number(row.quantity_issued || 0), installed: acc.installed + Number(row.quantity_installed || 0), returned: acc.returned + Number(row.quantity_returned || 0) }), { issued: 0, installed: 0, returned: 0 });

    return NextResponse.json({
      reservedParts: normalizedParts,
      movements: (movements || []).map((row) => ({ ...row, stock: stockMap.get(row.stock_id) || null })),
      totals: { ...counts, cost: Number(summary?.parts_cost || 0) },
      costSummary: {
        parts: Number(summary?.parts_cost || 0),
        labor: Number(summary?.labor_cost || 0),
        external: Number(summary?.external_cost || 0),
        total: Number(summary?.total_cost || 0),
        pendingParts: Number(summary?.pending_parts || 0),
        openLaborEntries: Number(summary?.open_labor_entries || 0),
      },
      canEdit: access.canWrite && scope === 'operational',
      record_scope: scope,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la trazabilidad de repuestos';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
