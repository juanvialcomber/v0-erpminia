export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getLaudusStockSnapshot } from '@/lib/integrations/laudus/client';
import { chunkLaudusStockRows, toLaudusStockStageRows } from '@/lib/integrations/laudus/inventory';

const ONE_SHOT_TOKEN = 'motil-stock-once-20261023-7f3c9e5a8b1d4c62';
const ORGANIZATION_ID = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';

type WarehouseRow = {
  external_id: string;
  laudus_warehouse_id: number;
  name: string | null;
};

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== ONE_SHOT_TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const supabase = getSupabaseServerClient();
  const dateTo = new Date().toISOString();
  const { data: warehouses, error: warehouseError } = await supabase
    .schema('integration')
    .from('laudus_warehouses')
    .select('external_id,laudus_warehouse_id,name')
    .eq('organization_id', ORGANIZATION_ID)
    .order('laudus_warehouse_id');

  if (warehouseError) {
    return NextResponse.json({ status: 'failed', stage: 'warehouses' }, { status: 500 });
  }

  const rows = (warehouses || []) as WarehouseRow[];
  let runId: string | null = null;
  let calls = 0;
  let staged = 0;
  let inserted = 0;
  let changed = 0;
  let unchanged = 0;
  let productResolved = 0;
  let productUnresolved = 0;
  const snapshots: Array<{warehouse: WarehouseRow; dateTo: string | null; rows: Array<{productId:string;sku:string|null;stock:number}>}> = [];

  for (const warehouse of rows) {
    const apiWarehouseId = String(warehouse.laudus_warehouse_id);
    const payload = await getLaudusStockSnapshot({ dateTo, warehouseId: apiWarehouseId });
    calls += 1;
    const normalized = toLaudusStockStageRows(payload, apiWarehouseId);
    snapshots.push({ warehouse, dateTo: normalized.dateTo, rows: normalized.rows });
  }

  const nonEmpty = snapshots.filter((snapshot) => snapshot.rows.length > 0);
  for (let snapshotIndex = 0; snapshotIndex < nonEmpty.length; snapshotIndex += 1) {
    const snapshot = nonEmpty[snapshotIndex];
    const chunks = chunkLaudusStockRows(snapshot.rows, 500);

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const finalize = snapshotIndex === nonEmpty.length - 1 && chunkIndex === chunks.length - 1;
      const { data, error } = await supabase.rpc('motil_ingest_laudus_product_stock', {
        p_organization_id: ORGANIZATION_ID,
        p_warehouse_external_id: snapshot.warehouse.external_id,
        p_date_to: snapshot.dateTo || dateTo,
        p_rows: chunks[chunkIndex],
        p_run_id: runId,
        p_finalize: finalize,
      });

      if (error) {
        return NextResponse.json({
          status: 'partial',
          calls,
          runId,
          warehouseExternalId: snapshot.warehouse.external_id,
          staged,
          stage: 'persist',
        }, { status: 500 });
      }

      const result = (data || {}) as Record<string, unknown>;
      if (!runId && typeof result.run_id === 'string') runId = result.run_id;
      staged += Number(result.batch_rows || 0);
      inserted += Number(result.inserted || 0);
      changed += Number(result.changed || 0);
      unchanged += Number(result.unchanged || 0);
      productResolved += Number(result.product_resolved || 0);
      productUnresolved += Number(result.product_unresolved || 0);
    }
  }

  return NextResponse.json({
    status: 'ok',
    calls,
    runId,
    dateTo,
    warehouses: snapshots.map((snapshot) => ({
      externalId: snapshot.warehouse.external_id,
      id: snapshot.warehouse.laudus_warehouse_id,
      name: snapshot.warehouse.name,
      rows: snapshot.rows.length,
    })),
    staged,
    inserted,
    changed,
    unchanged,
    productResolved,
    productUnresolved,
    canonicalInventoryMutated: false,
    laudusMutated: false,
  });
}
