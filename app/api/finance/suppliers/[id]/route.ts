export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { id } = await params;
    const canonical = context.supabase.schema('canonical');
    const intelligence = context.supabase.schema('intelligence');

    const [supplierResult, performanceResult, ordersResult, quotationsResult] = await Promise.all([
      canonical.from('suppliers').select('*').eq('organization_id', context.organizationId).eq('id', id).maybeSingle(),
      intelligence.from('supplier_performance').select('*').eq('organization_id', context.organizationId).eq('supplier_id', id).maybeSingle(),
      canonical.from('purchase_orders').select('id, order_number, order_date, currency, net_amount, tax_amount, total_amount, status, operational_status, validation_status, expected_delivery_date').eq('organization_id', context.organizationId).eq('canonical_supplier_id', id).order('order_date', { ascending: false }).limit(100),
      canonical.from('supplier_quotations').select('id, request_id, quotation_number, quotation_date, currency, total_amount, lead_time_days, payment_terms, status, valid_until, created_at').eq('organization_id', context.organizationId).eq('supplier_id', id).order('created_at', { ascending: false }).limit(100),
    ]);

    const error = supplierResult.error || performanceResult.error || ordersResult.error || quotationsResult.error;
    if (error) throw error;
    if (!supplierResult.data) return NextResponse.json({ error: 'Proveedor no encontrado' }, { status: 404 });

    const orderIds = (ordersResult.data || []).map((order) => order.id);
    const linesResult = orderIds.length
      ? await canonical.from('purchase_order_lines').select('purchase_order_id, product_code, description, quantity, unit, unit_cost, net_amount, canonical_product_id').eq('organization_id', context.organizationId).in('purchase_order_id', orderIds).limit(1000)
      : { data: [], error: null };
    if (linesResult.error) throw linesResult.error;

    const products = new Map<string, { product_code: string; description: string | null; quantity: number; spend: number }>();
    for (const line of linesResult.data || []) {
      const key = line.canonical_product_id || line.product_code || line.description || 'unknown';
      const current = products.get(key) || { product_code: line.product_code || 'Sin código', description: line.description || null, quantity: 0, spend: 0 };
      current.quantity += Number(line.quantity || 0);
      current.spend += Number(line.net_amount || 0);
      products.set(key, current);
    }

    return NextResponse.json({
      supplier: supplierResult.data,
      performance: performanceResult.data || null,
      purchaseOrders: ordersResult.data || [],
      quotations: quotationsResult.data || [],
      topProducts: [...products.values()].sort((a, b) => b.spend - a.spend).slice(0, 25),
      source: 'canonical.suppliers',
      canonical: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No fue posible cargar el proveedor';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
