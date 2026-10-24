export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getLaudusStockSnapshot, LaudusApiError } from '@/lib/integrations/laudus/client';
import { chunkLaudusStockRows, toLaudusStockStageRows } from '@/lib/integrations/laudus/inventory';

const ONE_SHOT_TOKEN = 'motil-stock-once-20261023-7f3c9e5a8b1d4c62';
const ORGANIZATION_ID = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';

const WAREHOUSES = [
  { external_id: '001', laudus_warehouse_id: 1, name: 'Bodega Santiago' },
  { external_id: '002', laudus_warehouse_id: 2, name: 'Bodega Central' },
  { external_id: '003', laudus_warehouse_id: 3, name: 'Bodega Mina Peumo' },
  { external_id: '004', laudus_warehouse_id: 4, name: 'Bodega Mina Don Jaime' },
  { external_id: '005', laudus_warehouse_id: 5, name: 'Servicios' },
  { external_id: '006', laudus_warehouse_id: 6, name: 'Retiro en Sucursal' },
  { external_id: '007', laudus_warehouse_id: 7, name: 'Casa Matriz' },
] as const;

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get('token') !== ONE_SHOT_TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const supabase = getSupabaseServerClient();
    const observedAt = new Date().toISOString();
    const dateTo = new Date()
      .toLocaleString('sv-SE', { timeZone: 'America/Santiago', hour12: false })
      .replace(' ', 'T');
    let runId: string | null = null;
    let calls = 0;
    let staged = 0;
    let inserted = 0;
    let changed = 0;
    let unchanged = 0;
    let productResolved = 0;
    let productUnresolved = 0;
    const snapshots: Array<{
      warehouse: (typeof WAREHOUSES)[number];
      dateTo: string | null;
      rows: Array<{productId:string;sku:string|null;stock:number}>;
    }> = [];

    for (const warehouse of WAREHOUSES) {
      const apiWarehouseId = warehouse.external_id;
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
          p_date_to: observedAt,
          p_rows: chunks[chunkIndex],
          p_run_id: runId,
          p_finalize: finalize,
        });

        if (error) {
          return NextResponse.json({
            status: 'failed',
            stage: 'persist',
            calls,
            runId,
            warehouseExternalId: snapshot.warehouse.external_id,
            staged,
            databaseCode: error.code || null,
            databaseMessage: String(error.message || '').slice(0, 240),
          });
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
  } catch (error) {
    const laudusError = error instanceof LaudusApiError ? error : null;
    return NextResponse.json({
      status: 'failed',
      stage: laudusError?.path || 'runtime',
      upstreamStatus: laudusError?.status || null,
      upstreamCode: laudusError?.upstreamCode || null,
      message: error instanceof Error ? error.message.slice(0, 240) : 'Unknown error',
      canonicalInventoryMutated: false,
      laudusMutated: false,
    });
  }
}
