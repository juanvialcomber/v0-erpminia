export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const supplierId = request.nextUrl.searchParams.get('supplierId');
  const q = request.nextUrl.searchParams.get('q')?.trim() || '';

  try {
    if (!supplierId) {
      let query = context.supabase
        .from('canonical_suppliers_v1')
        .select('id, tax_id, legal_name, trade_name, business_activity, payment_terms, email, phone, region, is_active, validation_status')
        .eq('organization_id', context.organizationId)
        .order('legal_name')
        .limit(80);
      if (q) query = query.or(`tax_id.ilike.%${q}%,legal_name.ilike.%${q}%,trade_name.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return NextResponse.json({ suppliers: data || [] });
    }

    const { data: supplier, error: supplierError } = await context.supabase
      .from('canonical_suppliers_v1')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('id', supplierId)
      .single();
    if (supplierError) throw supplierError;

    const orderFilter = `canonical_supplier_id.eq.${supplierId}${supplier.tax_id ? `,supplier_tax_id.eq.${supplier.tax_id}` : ''}`;
    const [ordersResult, quotationsResult, operationalOrdersResult, returnsResult, invoicesResult, performanceResult, legacyPerformanceResult, contractorResult, economicResult] = await Promise.all([
      context.supabase.from('canonical_purchase_orders_v1').select('id, order_number, order_date, total_amount, currency, status, operational_status, expected_delivery_date, supplier_tax_id').eq('organization_id', context.organizationId).or(orderFilter).order('order_date', { ascending: false }).limit(100),
      context.supabase.from('canonical_supplier_quotations_v1').select('id, quotation_number, quotation_date, valid_until, total_amount, currency, lead_time_days, payment_terms, status').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).order('quotation_date', { ascending: false }).limit(100),
      context.supabase.from('procurement_operational_orders').select('id, order_number, status, currency, total_amount, expected_delivery_date, actual_delivery_date, issued_at').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).order('issued_at', { ascending: false }).limit(100),
      context.supabase.from('procurement_supplier_returns').select('id, return_number, reason, resolution_type, status, requested_at, resolved_at').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).order('requested_at', { ascending: false }).limit(100),
      context.supabase.from('procurement_supplier_invoices').select('id, invoice_number, invoice_date, total_amount, currency, status, approval_basis, procurement_match_exceptions(id,status,exception_type,difference)').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).order('invoice_date', { ascending: false }).limit(100),
      context.supabase.from('supplier_operational_score_v2').select('*').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).maybeSingle(),
      context.supabase.from('supplier_performance_v1').select('*').eq('organization_id', context.organizationId).eq('supplier_id', supplierId).maybeSingle(),
      context.supabase.from('contractors').select('id, name, rut, business_type, contact_email, contact_phone, address, city, region, registration_status').eq('rut', supplier.tax_id).maybeSingle(),
      context.supabase.rpc('motil_supplier_economic_snapshot', {
        p_organization_id: context.organizationId,
        p_supplier_tax_id: supplier.tax_id,
        p_scope_days: 365,
      }),
    ]);

    const firstError = [ordersResult, quotationsResult, operationalOrdersResult, returnsResult, invoicesResult, performanceResult, legacyPerformanceResult, contractorResult, economicResult].find((result) => result.error)?.error;
    if (firstError) throw firstError;

    const orderIds = (ordersResult.data || []).map((order) => order.id);
    const [linesResult, contractsResult, documentsResult] = await Promise.all([
      orderIds.length
        ? context.supabase.from('canonical_purchase_order_lines_v1').select('purchase_order_id, canonical_product_id, product_code, description, quantity, unit, unit_cost, net_amount').eq('organization_id', context.organizationId).in('purchase_order_id', orderIds).limit(3000)
        : Promise.resolve({ data: [], error: null }),
      contractorResult.data
        ? context.supabase.from('contracts').select('id, contract_number, contract_type, title, start_date, end_date, contract_value, currency, status, payment_terms, document_url, file_url').eq('organization_id', context.organizationId).eq('contractor_id', contractorResult.data.id).order('start_date', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      contractorResult.data
        ? context.supabase.from('procurement_documents').select('id, document_type, document_number, issue_date, due_date, amount, currency, status, document_url').eq('contractor_id', contractorResult.data.id).order('issue_date', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);
    const secondaryError = linesResult.error || contractsResult.error || documentsResult.error;
    if (secondaryError) throw secondaryError;

    const productMap = new Map<string, { canonical_product_id: string | null; product_code: string | null; description: string | null; quantity: number; spend: number; last_unit_cost: number }>();
    for (const line of linesResult.data || []) {
      const key = line.canonical_product_id || line.product_code || line.description || 'sin-codigo';
      const current = productMap.get(key) || { canonical_product_id: line.canonical_product_id, product_code: line.product_code, description: line.description, quantity: 0, spend: 0, last_unit_cost: 0 };
      current.quantity += Number(line.quantity || 0);
      current.spend += Number(line.net_amount || 0);
      current.last_unit_cost = Number(line.unit_cost || current.last_unit_cost || 0);
      productMap.set(key, current);
    }

    return NextResponse.json({
      supplier,
      contractor: contractorResult.data || null,
      performance: performanceResult.data || null,
      legacyPerformance: legacyPerformanceResult.data || null,
      orders: ordersResult.data || [],
      operationalOrders: operationalOrdersResult.data || [],
      quotations: quotationsResult.data || [],
      contracts: contractsResult.data || [],
      documents: documentsResult.data || [],
      invoices: invoicesResult.data || [],
      returns: returnsResult.data || [],
      suppliedProducts: Array.from(productMap.values()).sort((a, b) => b.spend - a.spend).slice(0, 100),
      economic: economicResult.data || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la ficha del proveedor.';
    console.error('[procurement/suppliers-360]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
