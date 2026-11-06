import { orgHasCanonicalData } from '@/lib/api/canonical';
import { isStockBelowMinimum } from '@/lib/inventory-alerts';
import { loadBodegaOperationalQuantities, resolvedOperationalQuantity } from '@/lib/bodega-operational-stock';

type SupabaseClientLike = any;

type CanonicalInventoryRow = {
  id: string;
  sku: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  quantity: number | string | null;
  min_stock: number | string | null;
  warehouse_code: string | null;
};

type WarehouseInventoryRow = {
  id: string;
  part_code: string | null;
  part_name: string | null;
  quantity_on_hand: number | string | null;
  reorder_level: number | string | null;
  bin_location?: string | null;
  bin?:
    | { bin_code?: string | null; bin_location?: string | null }
    | Array<{ bin_code?: string | null; bin_location?: string | null }>
    | null;
};

export type InventoryStockAlertItem = {
  id: string;
  part_code: string | null;
  part_name: string | null;
  category: string | null;
  quantity_on_hand: number;
  reorder_level: number;
  location_label: string;
};

export type InventoryStockAlertResult = {
  items: InventoryStockAlertItem[];
  evaluatedItems: number;
  dataSource: 'canonical' | 'warehouse';
};

type AlertReadResult = {
  items: InventoryStockAlertItem[];
  evaluatedItems: number;
};

const PAGE_SIZE = 1000;

async function readCanonicalAlerts(
  organizationId: string,
  supabase: SupabaseClientLike,
): Promise<AlertReadResult | null> {
  const rows: CanonicalInventoryRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('canonical_inventory_current')
      .select('id, sku, name, description, category, quantity, min_stock, warehouse_code')
      .eq('organization_id', organizationId)
      .gt('min_stock', 0)
      .order('sku', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

    if (error) return null;
    const batch = Array.isArray(data) ? (data as CanonicalInventoryRow[]) : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const operational = await loadBodegaOperationalQuantities(supabase, organizationId, rows.map((row) => row.id));

  const items = rows
    .map((row) => ({ row, quantity: resolvedOperationalQuantity(row.quantity, operational.get(row.id)) }))
    .filter(({ row, quantity }) => isStockBelowMinimum(quantity, row.min_stock))
    .map(({ row, quantity }) => ({
      id: row.id,
      part_code: row.sku,
      part_name: row.name || row.description || row.sku,
      category: row.category,
      quantity_on_hand: quantity,
      reorder_level: Number(row.min_stock || 0),
      location_label: row.warehouse_code || 'bodega',
    }));

  return { items, evaluatedItems: rows.length };
}

async function readWarehouseAlerts(
  organizationId: string,
  supabase: SupabaseClientLike,
): Promise<AlertReadResult> {
  const rows: WarehouseInventoryRow[] = [];

  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('warehouse_stock')
      .select('id, part_code, part_name, quantity_on_hand, reorder_level, bin_location, bin:warehouse_bins(bin_code, bin_location)')
      .eq('organization_id', organizationId)
      .gt('reorder_level', 0)
      .order('part_code', { ascending: true })
      .order('id', { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

    if (error) throw error;
    const batch = Array.isArray(data) ? (data as WarehouseInventoryRow[]) : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  const items = rows
    .filter((row) => isStockBelowMinimum(row.quantity_on_hand, row.reorder_level))
    .map((row) => {
      const bin = Array.isArray(row.bin) ? row.bin[0] : row.bin;
      return {
        id: row.id,
        part_code: row.part_code,
        part_name: row.part_name || row.part_code,
        category: null,
        quantity_on_hand: Number(row.quantity_on_hand || 0),
        reorder_level: Number(row.reorder_level || 0),
        location_label: bin?.bin_code || bin?.bin_location || row.bin_location || 'bodega',
      };
    });

  return { items, evaluatedItems: rows.length };
}

export async function listInventoryStockAlerts(input: {
  organizationId: string;
  supabase: SupabaseClientLike;
}): Promise<InventoryStockAlertResult> {
  if (orgHasCanonicalData(input.organizationId)) {
    const canonicalResult = await readCanonicalAlerts(input.organizationId, input.supabase);
    if (canonicalResult !== null) {
      return { ...canonicalResult, dataSource: 'canonical' };
    }
  }

  const warehouseResult = await readWarehouseAlerts(input.organizationId, input.supabase);
  return { ...warehouseResult, dataSource: 'warehouse' };
}
