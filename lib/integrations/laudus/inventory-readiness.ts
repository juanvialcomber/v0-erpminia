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

export async function loadLaudusInventoryReadiness(
  db: SupabaseClient,
  organizationId: string,
) {
  const [
    stockRows,
    stockProductLinks,
    stockWithCountDate,
    movements,
    snapshotRows,
    snapshotWarehouse,
    snapshotNegative,
    latestSnapshot,
    laudusProducts,
    laudusProductsLinked,
    laudusStockRows,
    laudusWarehouses,
    latestLaudusStock,
  ] = await Promise.all([
    count(db.from('warehouse_stock').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('warehouse_stock').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('canonical_product_id', 'is', null)),
    count(db.from('warehouse_stock').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('last_counted_date', 'is', null)),
    count(db.from('stock_movements').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('canonical_inventory_current').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('canonical_inventory_current').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('warehouse_code', 'is', null).neq('warehouse_code', '')),
    count(db.from('canonical_inventory_current').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).lt('quantity', 0)),
    db
      .from('canonical_inventory_current')
      .select('snapshot_date')
      .eq('organization_id', organizationId)
      .not('snapshot_date', 'is', null)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    count(db.schema('integration').from('laudus_products').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('integration').from('laudus_products').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('canonical_product_id', 'is', null)),
    count(db.schema('integration').from('laudus_product_stock').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    db
      .schema('integration')
      .from('laudus_warehouses')
      .select('external_id,name,motil_warehouse_id,reconciliation_status')
      .eq('organization_id', organizationId),
    db
      .schema('integration')
      .from('laudus_product_stock')
      .select('synced_at')
      .eq('organization_id', organizationId)
      .order('synced_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (latestSnapshot.error) throw new Error(latestSnapshot.error.message);
  if (laudusWarehouses.error) throw new Error(laudusWarehouses.error.message);
  if (latestLaudusStock.error) throw new Error(latestLaudusStock.error.message);

  let laudusState: 'waiting_laudus' | 'ready_to_compare' | 'review' = laudusStockRows > 0
    ? 'ready_to_compare'
    : 'waiting_laudus';
  let openReconciliation = 0;

  try {
    const source = await db
      .schema('integration')
      .from('external_sources')
      .select('id,enabled')
      .eq('organization_id', organizationId)
      .eq('source_key', 'laudus')
      .maybeSingle();

    if (!source.error && source.data?.enabled) {
      const [run, unresolvedInventory, unresolvedWarehouses] = await Promise.all([
        db
          .schema('integration')
          .from('sync_runs')
          .select('status')
          .eq('organization_id', organizationId)
          .eq('source_id', source.data.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .schema('integration')
          .from('reconciliation_items')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('source_id', source.data.id)
          .in('entity_type', ['product', 'stock'])
          .in('resolution_status', ['pending', 'conflict', 'new_candidate']),
        db
          .schema('integration')
          .from('laudus_warehouses')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .in('reconciliation_status', ['new_candidate', 'conflict']),
      ]);

      if (unresolvedInventory.error) throw new Error(unresolvedInventory.error.message);
      if (unresolvedWarehouses.error) throw new Error(unresolvedWarehouses.error.message);
      openReconciliation = (unresolvedInventory.count ?? 0) + (unresolvedWarehouses.count ?? 0);

      const status = String(run.data?.status || '').toLowerCase();
      if (status === 'partial' || status === 'failed' || openReconciliation > 0) laudusState = 'review';
      else if (status === 'completed' || laudusStockRows > 0) laudusState = 'ready_to_compare';
    }
  } catch {
    if (laudusStockRows > 0) laudusState = 'ready_to_compare';
  }

  const physicalWarehouseIds = new Set(['001', '002', '003', '004']);
  const physicalWarehouses = (laudusWarehouses.data || []).filter((row: any) =>
    physicalWarehouseIds.has(String(row.external_id || '')),
  );
  const mappedPhysicalWarehouses = physicalWarehouses.filter((row: any) =>
    Boolean(row.motil_warehouse_id) && String(row.reconciliation_status || '') === 'matched',
  );

  return {
    stock: {
      rows: stockRows,
      productCoverage: pct(stockProductLinks, stockRows),
      physicalCountCoverage: pct(stockWithCountDate, stockRows),
    },
    snapshot: {
      rows: snapshotRows,
      warehouseCoverage: pct(snapshotWarehouse, snapshotRows),
      latestDate: latestSnapshot.data?.snapshot_date || null,
      negativeRows: snapshotNegative,
    },
    movementCount: movements,
    laudus: {
      products: laudusProducts,
      canonicalProductCoverage: pct(laudusProductsLinked, laudusProducts),
      stockRows: laudusStockRows,
      warehouses: (laudusWarehouses.data || []).length,
      physicalWarehouses: physicalWarehouses.length,
      mappedPhysicalWarehouses: mappedPhysicalWarehouses.length,
      latestStockSync: latestLaudusStock.data?.synced_at || null,
      openReconciliation,
    },
    reconciliation: {
      state: laudusState,
      defaultAbsoluteTolerance: 0,
      requiresApprovedTolerance: true,
      physicalCountUsedAsEvidence: true,
      autoApply: false as const,
    },
    policy: {
      laudusStockRole: 'erp_evidence' as const,
      motilOperationalStockRole: 'operational_truth' as const,
      autoOverwrite: false as const,
    },
  };
}
