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
  ]);

  if (latestSnapshot.error) throw new Error(latestSnapshot.error.message);

  let laudusState: 'waiting_laudus' | 'ready_to_compare' | 'review' = 'waiting_laudus';

  try {
    const source = await db
      .schema('integration')
      .from('external_sources')
      .select('id,enabled')
      .eq('organization_id', organizationId)
      .eq('source_key', 'laudus')
      .maybeSingle();

    if (!source.error && source.data?.enabled) {
      const run = await db
        .schema('integration')
        .from('sync_runs')
        .select('status')
        .eq('organization_id', organizationId)
        .eq('source_id', source.data.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const status = String(run.data?.status || '').toLowerCase();
      if (status === 'completed') laudusState = 'ready_to_compare';
      if (status === 'partial' || status === 'failed') laudusState = 'review';
    }
  } catch {
    // Expected before the private integration schema is deployed.
  }

  let laudusStockRows = 0;
  let laudusNegativeRows = 0;
  let laudusKardexRows = 0;

  try {
    [laudusStockRows, laudusNegativeRows, laudusKardexRows] = await Promise.all([
      count(db.schema('integration').from('laudus_product_stock').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
      count(db.schema('integration').from('laudus_product_stock').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).lt('stock', 0)),
      count(db.schema('integration').from('laudus_product_kardex').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    ]);
  } catch {
    // Keep readiness available if the private Laudus staging schema is not deployed yet.
  }

  return {
    laudus: {
      stockRows: laudusStockRows,
      negativeRows: laudusNegativeRows,
      kardexRows: laudusKardexRows,
    },
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
    motilMovementCount: movements,
    reconciliation: {
      state: laudusState,
      defaultAbsoluteTolerance: 0,
      requiresApprovedTolerance: true,
      physicalCountUsedAsEvidence: true,
      autoApply: false,
    },
    policy: {
      laudusStockRole: 'erp_evidence',
      motilOperationalStockRole: 'operational_truth',
      autoOverwrite: false,
    },
  };
}
