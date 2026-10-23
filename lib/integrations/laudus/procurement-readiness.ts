import type { SupabaseClient } from '@supabase/supabase-js';

type CountResult = { count: number | null; error: { message: string } | null };

async function count(query: PromiseLike<CountResult>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function loadLaudusProcurementReadiness(
  db: SupabaseClient,
  organizationId: string,
) {
  const [
    orders,
    ordersSupplier,
    ordersCostCenter,
    ordersAmount,
    ordersCurrency,
    lines,
    linesProduct,
    linesQuantity,
    linesCost,
    linesUnit,
    linesReceived,
    linesCostCenter,
    linesAsset,
  ] = await Promise.all([
    count(db.schema('canonical').from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('canonical').from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('canonical_supplier_id', 'is', null)),
    count(db.schema('canonical').from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('cost_center_code', 'is', null).neq('cost_center_code', '')),
    count(db.schema('canonical').from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('total_amount', 'is', null)),
    count(db.schema('canonical').from('purchase_orders').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('currency', 'is', null).neq('currency', '')),
    count(db.schema('canonical').from('purchase_order_lines').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('canonical').from('purchase_order_lines').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('canonical_product_id', 'is', null)),
    count(db.schema('canonical').from('purchase_order_lines').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('quantity', 'is', null)),
    count(db.schema('canonical').from('purchase_order_lines').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('unit_cost', 'is', null)),
    count(db.schema('canonical').from('purchase_order_lines').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('unit', 'is', null).neq('unit', '')),
    count(db.schema('canonical').from('purchase_order_lines').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('quantity_received', 'is', null)),
    count(db.schema('canonical').from('purchase_order_lines').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('cost_center_code', 'is', null).neq('cost_center_code', '')),
    count(db.schema('canonical').from('purchase_order_lines').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('asset_reference', 'is', null).neq('asset_reference', '')),
  ]);

  return {
    orders: {
      total: orders,
      supplierCoverage: pct(ordersSupplier, orders),
      costCenterCoverage: pct(ordersCostCenter, orders),
      amountCoverage: pct(ordersAmount, orders),
      currencyCoverage: pct(ordersCurrency, orders),
    },
    lines: {
      total: lines,
      productCoverage: pct(linesProduct, lines),
      quantityCoverage: pct(linesQuantity, lines),
      costCoverage: pct(linesCost, lines),
      unitCoverage: pct(linesUnit, lines),
      receivedCoverage: pct(linesReceived, lines),
      costCenterCoverage: pct(linesCostCenter, lines),
      assetCoverage: pct(linesAsset, lines),
    },
  };
}
