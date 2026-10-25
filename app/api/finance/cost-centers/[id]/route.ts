export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, routeContext: RouteContext) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { id } = await routeContext.params;
    const intelligence = context.supabase.schema('intelligence');
    const canonical = context.supabase.schema('canonical');

    const centerResult = await intelligence
      .from('cost_center_financials')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('canonical_cost_center_id', id)
      .maybeSingle();

    if (centerResult.error) throw centerResult.error;
    if (!centerResult.data) return NextResponse.json({ error: 'Centro de costo no encontrado' }, { status: 404 });

    const code = centerResult.data.cost_center_code;
    const publicCostCenterId = centerResult.data.public_cost_center_id;

    const [costsResult, ordersResult, workOrdersResult, assetsResult] = await Promise.all([
      intelligence
        .from('cost_center_actual_costs')
        .select('id, transaction_date, asset_code, asset_name, category, document_number, description, quantity, unit_cost, total_cost, currency, validation_status')
        .eq('organization_id', context.organizationId)
        .eq('cost_center_code', code)
        .order('transaction_date', { ascending: false })
        .limit(200),
      intelligence
        .from('cost_center_purchase_orders')
        .select('purchase_order_id, order_number, order_date, supplier_name, currency, committed_amount, line_count, status, operational_status, validation_status')
        .eq('organization_id', context.organizationId)
        .eq('cost_center_code', code)
        .order('order_date', { ascending: false })
        .limit(100),
      publicCostCenterId
        ? context.supabase
            .from('maintenance_work_orders')
            .select('id, work_order_number, title, status, priority, scheduled_date, canonical_asset_id, assigned_to_name, updated_at')
            .eq('organization_id', context.organizationId)
            .eq('cost_center_id', publicCostCenterId)
            .order('updated_at', { ascending: false })
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      canonical
        .from('assets')
        .select('id, asset_code, name, category, status')
        .eq('organization_id', context.organizationId)
        .eq('cost_center_code', code)
        .eq('is_active', true)
        .order('asset_code'),
    ]);

    const error = costsResult.error || ordersResult.error || workOrdersResult.error || assetsResult.error;
    if (error) throw error;

    return NextResponse.json({
      costCenter: centerResult.data,
      actualCosts: costsResult.data || [],
      purchaseOrders: (ordersResult.data || []).map((row) => ({
        id: row.purchase_order_id,
        order_number: row.order_number,
        order_date: row.order_date,
        supplier_name: row.supplier_name,
        currency: row.currency,
        total_amount: row.committed_amount,
        line_count: row.line_count,
        status: row.status,
        operational_status: row.operational_status,
        validation_status: row.validation_status,
      })),
      workOrders: workOrdersResult.data || [],
      assets: assetsResult.data || [],
      source: 'intelligence + canonical',
      canonical: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la trazabilidad financiera';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
