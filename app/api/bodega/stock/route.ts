export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { orgHasCanonicalData } from '@/lib/api/canonical';
import { isStockBelowMinimum } from '@/lib/inventory-alerts';
import { loadLaudusEffectiveStock } from '@/lib/integrations/laudus/effective-stock';

type CanonicalInventoryRow = {
  id: string;
  sku: string | null;
  name: string | null;
  category: string | null;
  description: string | null;
  quantity: number | string | null;
  min_stock: number | string | null;
  max_stock: number | string | null;
  unit_cost: number | string | null;
  total_value: number | string | null;
  warehouse_code: string | null;
};

type PriceBenchmarkRow = {
  product_code: string | null;
  is_fuel: boolean | null;
  benchmark_unit_cost: number | string | null;
  benchmark_method: string | null;
  benchmark_sample_count: number | string | null;
  benchmark_supplier_count: number | string | null;
  latest_observed_unit_cost: number | string | null;
  latest_observed_order_number: string | null;
  latest_observed_supplier_name: string | null;
};

type WarehouseBinRow = {
  bin_code: string | null;
  bin_location: string | null;
};

type WarehouseStockRow = {
  id: string;
  part_code: string | null;
  part_name: string | null;
  quantity_on_hand: number | string | null;
  quantity_reserved: number | string | null;
  reorder_level: number | string | null;
  reorder_quantity: number | string | null;
  unit_cost: number | string | null;
  bin_location: string | null;
  bin?: WarehouseBinRow | null;
};

type WarehouseStockItem = {
  id: string;
  part_code: string | null;
  part_name: string | null;
  quantity_on_hand: number;
  quantity_reserved: number;
  quantity_available: number;
  reorder_level: number;
  reorder_quantity: number;
  unit_cost: number;
  total_value: number;
  bin_location: string;
  is_low_stock: boolean;
  is_critical: boolean;
  reference_unit_cost: number | null;
  reference_method: string | null;
  reference_sample_count: number;
  reference_supplier_count: number;
  reference_is_fuel: boolean;
  latest_observed_unit_cost: number | null;
  latest_observed_order_number: string | null;
  latest_observed_supplier_name: string | null;
};

type OrgContext = Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>;

async function getPriceBenchmarks(context: OrgContext) {
  const rows: PriceBenchmarkRow[] = [];
  const pageSize = 1000;
  let start = 0;

  while (true) {
    const { data, error } = await context.supabase
      .from('canonical_product_price_benchmarks_v1')
      .select('product_code,is_fuel,benchmark_unit_cost,benchmark_method,benchmark_sample_count,benchmark_supplier_count,latest_observed_unit_cost,latest_observed_order_number,latest_observed_supplier_name')
      .eq('organization_id', context.organizationId)
      .order('product_code')
      .range(start, start + pageSize - 1);

    if (error) throw error;
    const batch = Array.isArray(data) ? (data as PriceBenchmarkRow[]) : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    start += pageSize;
  }

  return new Map(rows.filter((row) => row.product_code).map((row) => [String(row.product_code).trim().toLowerCase(), row]));
}

function emptyReference() {
  return {
    reference_unit_cost: null,
    reference_method: null,
    reference_sample_count: 0,
    reference_supplier_count: 0,
    reference_is_fuel: false,
    latest_observed_unit_cost: null,
    latest_observed_order_number: null,
    latest_observed_supplier_name: null,
  };
}

function referenceFor(code: string | null, benchmarks: Map<string, PriceBenchmarkRow>) {
  if (!code) return emptyReference();
  const row = benchmarks.get(code.trim().toLowerCase());
  if (!row) return emptyReference();
  return {
    reference_unit_cost: row.benchmark_unit_cost == null ? null : Number(row.benchmark_unit_cost),
    reference_method: row.benchmark_method || null,
    reference_sample_count: Number(row.benchmark_sample_count || 0),
    reference_supplier_count: Number(row.benchmark_supplier_count || 0),
    reference_is_fuel: Boolean(row.is_fuel),
    latest_observed_unit_cost: row.latest_observed_unit_cost == null ? null : Number(row.latest_observed_unit_cost),
    latest_observed_order_number: row.latest_observed_order_number || null,
    latest_observed_supplier_name: row.latest_observed_supplier_name || null,
  };
}

async function buildCanonicalStock(context: OrgContext): Promise<{ items: WarehouseStockItem[]; summary: Record<string, number>; pricingWarning?: string; stockAuthority?: Record<string, unknown> } | null> {
  const pageSize = 1000;
  let start = 0;
  const rows: CanonicalInventoryRow[] = [];

  while (true) {
    const { data, error } = await context.supabase
      .from('canonical_inventory_current')
      .select('id, sku, name, category, description, quantity, min_stock, max_stock, unit_cost, total_value, warehouse_code')
      .eq('organization_id', context.organizationId)
      .order('sku')
      .range(start, start + pageSize - 1);

    if (error) return null;
    const batch = Array.isArray(data) ? (data as CanonicalInventoryRow[]) : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
    start += pageSize;
  }

  if (rows.length === 0) return null;

  let benchmarks = new Map<string, PriceBenchmarkRow>();
  let pricingWarning: string | undefined;
  try {
    benchmarks = await getPriceBenchmarks(context);
  } catch (error) {
    pricingWarning = error instanceof Error ? error.message : 'No se pudo cargar la referencia de precios';
    console.error('[bodega/stock:pricing]', error);
  }

  let effectiveStock: Awaited<ReturnType<typeof loadLaudusEffectiveStock>> | null = null;
  try {
    effectiveStock = await loadLaudusEffectiveStock(context.supabase, context.organizationId, rows.map((row) => row.sku));
  } catch (error) {
    console.error('[bodega/stock:laudus-authority]', error);
  }

  const items: WarehouseStockItem[] = rows.map((row) => {
    const sku = String(row.sku || '').trim().toUpperCase();
    const laudusQuantity = effectiveStock?.isPrimary ? effectiveStock.stockBySku.get(sku) : undefined;
    const quantityOnHand = laudusQuantity ?? Number(row.quantity || 0);
    const reorderLevel = Number(row.min_stock || 0);
    const unitCost = Number(row.unit_cost || 0);
    const totalValue = Number(row.total_value ?? quantityOnHand * unitCost);

    return {
      id: row.id,
      part_code: row.sku,
      part_name: row.name || row.description || row.sku,
      quantity_on_hand: quantityOnHand,
      quantity_reserved: 0,
      quantity_available: quantityOnHand,
      reorder_level: reorderLevel,
      reorder_quantity: Number(row.max_stock || 0),
      unit_cost: unitCost,
      total_value: totalValue,
      bin_location: row.warehouse_code || 'N/A',
      is_low_stock: isStockBelowMinimum(quantityOnHand, reorderLevel),
      is_critical: isStockBelowMinimum(quantityOnHand, reorderLevel) && quantityOnHand <= 0,
      ...referenceFor(row.sku, benchmarks),
    };
  });

  const summary = {
    total_items: items.length,
    total_quantity: items.reduce((sum, i) => sum + i.quantity_on_hand, 0),
    total_value: items.reduce((sum, i) => sum + i.total_value, 0),
    low_stock_count: items.filter((i) => i.is_low_stock).length,
    critical_count: items.filter((i) => i.is_critical).length,
    reference_price_count: items.filter((i) => i.reference_unit_cost != null).length,
  };

  return {
    items,
    summary,
    ...(pricingWarning ? { pricingWarning } : {}),
    stockAuthority: effectiveStock ? {
      state: effectiveStock.authorityState,
      reason: effectiveStock.authorityReason,
      latestSync: effectiveStock.latestSync,
      effectiveSource: effectiveStock.isPrimary ? 'laudus' : 'motil',
    } : undefined,
  };
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    if (orgHasCanonicalData(context.organizationId)) {
      const canonical = await buildCanonicalStock(context);
      if (canonical) return NextResponse.json({ ...canonical, dataSource: 'canonical' });
    }

    const { data: stock, error } = await context.supabase
      .from('warehouse_stock')
      .select('*, bin:warehouse_bins(bin_code, bin_location)')
      .eq('organization_id', context.organizationId)
      .order('part_code');

    if (error) throw error;

    let benchmarks = new Map<string, PriceBenchmarkRow>();
    let pricingWarning: string | undefined;
    try {
      benchmarks = await getPriceBenchmarks(context);
    } catch (pricingError) {
      pricingWarning = pricingError instanceof Error ? pricingError.message : 'No se pudo cargar la referencia de precios';
      console.error('[bodega/stock:pricing]', pricingError);
    }

    const rows = Array.isArray(stock) ? (stock as WarehouseStockRow[]) : [];
    const items: WarehouseStockItem[] = rows.map((item) => {
      const quantityOnHand = Number(item.quantity_on_hand || 0);
      const quantityReserved = Number(item.quantity_reserved || 0);
      const reorderLevel = Number(item.reorder_level || 0);
      const reorderQuantity = Number(item.reorder_quantity || 0);
      const unitCost = Number(item.unit_cost || 0);

      return {
        id: item.id,
        part_code: item.part_code,
        part_name: item.part_name,
        quantity_on_hand: quantityOnHand,
        quantity_reserved: quantityReserved,
        quantity_available: quantityOnHand - quantityReserved,
        reorder_level: reorderLevel,
        reorder_quantity: reorderQuantity,
        unit_cost: unitCost,
        total_value: quantityOnHand * unitCost,
        bin_location: item.bin?.bin_location || item.bin_location || 'N/A',
        is_low_stock: isStockBelowMinimum(quantityOnHand, reorderLevel),
        is_critical: isStockBelowMinimum(quantityOnHand, reorderLevel) && quantityOnHand <= 0,
        ...referenceFor(item.part_code, benchmarks),
      };
    });

    const summary = {
      total_items: items.length,
      total_quantity: items.reduce((sum, i) => sum + i.quantity_on_hand, 0),
      total_value: items.reduce((sum, i) => sum + i.total_value, 0),
      low_stock_count: items.filter((i) => i.is_low_stock).length,
      critical_count: items.filter((i) => i.is_critical).length,
      reference_price_count: items.filter((i) => i.reference_unit_cost != null).length,
    };

    return NextResponse.json({ items, summary, dataSource: 'warehouse', ...(pricingWarning ? { pricingWarning } : {}) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo obtener el stock';
    return NextResponse.json({
      items: [],
      summary: {
        total_items: 0,
        total_quantity: 0,
        total_value: 0,
        low_stock_count: 0,
        critical_count: 0,
        reference_price_count: 0,
      },
      warning: message,
    });
  }
}
