import { getLaudusStockSnapshot, LaudusApiError } from '@/lib/integrations/laudus/client';
import { chunkLaudusStockRows, toLaudusStockStageRows } from '@/lib/integrations/laudus/inventory';
import { markLaudusSyncFailure, markLaudusSyncRunning, markLaudusSyncSuccess, retryPolicy } from '@/lib/integrations/laudus/sync-policy';

type WarehouseRow = {
  external_id: string;
  laudus_warehouse_id: number;
  name: string | null;
};

type Snapshot = {
  warehouse: WarehouseRow;
  dateTo: string | null;
  rows: Array<{ productId: string; sku: string | null; stock: number }>;
};

async function fetchStockWithRetry(args: { dateTo: string; warehouseId: string }, onCall: () => void) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      onCall();
      return await getLaudusStockSnapshot(args);
    } catch (error) {
      if (!(error instanceof LaudusApiError)) throw error;
      const decision = retryPolicy(error.status, attempt);
      if (!decision.retry || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
    }
  }
  throw new Error('Laudus stock retry exhausted');
}

export async function syncLaudusStockDaily(organizationId: string, supabase: any) {
  await markLaudusSyncRunning(supabase, organizationId, 'stock');
  const { data: warehouses, error: warehouseError } = await supabase
    .from('laudus_warehouses_service_v1')
    .select('external_id,laudus_warehouse_id,name')
    .eq('organization_id', organizationId)
    .order('laudus_warehouse_id');

  if (warehouseError) throw new Error('Laudus warehouse lookup failed');

  const physicalWarehouseIds = new Set(['001', '002', '003', '004']);
  const warehouseRows = ((warehouses || []) as WarehouseRow[]).filter((warehouse) => physicalWarehouseIds.has(warehouse.external_id));
  if (!warehouseRows.length) throw new Error('No physical Laudus warehouses available');

  const dateTo = new Date()
    .toLocaleString('sv-SE', { timeZone: 'America/Santiago', hour12: false })
    .replace(' ', 'T');

  // Read every physical warehouse before staging anything. If Laudus fails mid-read,
  // MOTIL keeps the previous complete evidence snapshot untouched.
  const snapshots: Snapshot[] = [];
  let apiCalls = 0;
  for (const warehouse of warehouseRows) {
    const payload = await fetchStockWithRetry({
      dateTo,
      warehouseId: warehouse.external_id,
    }, () => { apiCalls += 1; });
    const normalized = toLaudusStockStageRows(payload, warehouse.external_id);
    snapshots.push({ warehouse, dateTo: normalized.dateTo, rows: normalized.rows });
  }

  const nonEmpty = snapshots.filter((snapshot) => snapshot.rows.length > 0);
  if (!nonEmpty.length) {
    await markLaudusSyncSuccess(supabase, organizationId, 'stock', {
      processed: 0,
      changed: 0,
      conflicts: 0,
      apiCalls,
      metadata: { warehouses: warehouseRows.length, staged: 0 },
    });
    return {
      status: 'empty' as const,
      organizationId,
      apiCalls,
      warehouses: warehouseRows.length,
      staged: 0,
      canonicalInventoryMutated: false,
      laudusMutated: false,
    };
  }

  const batches = nonEmpty.flatMap((snapshot) =>
    chunkLaudusStockRows(snapshot.rows, 500).map((rows) => ({ snapshot, rows })),
  );

  let runId: string | null = null;
  let staged = 0;
  let inserted = 0;
  let changed = 0;
  let unchanged = 0;
  let productResolved = 0;
  let productUnresolved = 0;

  try {
    for (let index = 0; index < batches.length; index += 1) {
      const batch = batches[index];
      const isLastBatch = index === batches.length - 1;
      const { data, error } = await supabase.rpc('motil_ingest_laudus_product_stock', {
        p_organization_id: organizationId,
        p_warehouse_external_id: batch.snapshot.warehouse.external_id,
        p_date_to: batch.snapshot.dateTo || dateTo,
        p_rows: batch.rows,
        p_run_id: runId,
        p_finalize: isLastBatch,
      });

      if (error) throw new Error('Laudus stock staging failed');

      const result = (data || {}) as Record<string, unknown>;
      if (!runId && typeof result.run_id === 'string') runId = result.run_id;
      staged += Number(result.batch_rows || 0);
      inserted += Number(result.inserted || 0);
      changed += Number(result.changed || 0);
      unchanged += Number(result.unchanged || 0);
      productResolved += Number(result.product_resolved || 0);
      productUnresolved += Number(result.product_unresolved || 0);
    }

    await markLaudusSyncSuccess(supabase, organizationId, 'stock', {
      runId,
      processed: staged,
      changed,
      conflicts: productUnresolved,
      apiCalls,
      metadata: { warehouses: warehouseRows.length, inserted, unchanged, productResolved, productUnresolved },
    });
  } catch (error) {
    await markLaudusSyncFailure(supabase, organizationId, 'stock', error, {
      runId,
      processed: staged,
      changed,
      conflicts: productUnresolved,
      apiCalls,
      metadata: { warehouses: warehouseRows.length, inserted, unchanged, productResolved, productUnresolved },
    });
    throw error;
  }

  return {
    status: 'completed' as const,
    organizationId,
    apiCalls,
    warehouses: warehouseRows.length,
    runId,
    staged,
    inserted,
    changed,
    unchanged,
    productResolved,
    productUnresolved,
    canonicalInventoryMutated: false,
    laudusMutated: false,
  };
}
