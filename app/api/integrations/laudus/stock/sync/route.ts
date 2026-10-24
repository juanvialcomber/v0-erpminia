export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getLaudusStockSnapshot } from '@/lib/integrations/laudus/client';
import { chunkLaudusStockRows, toLaudusStockStageRows } from '@/lib/integrations/laudus/inventory';

type WarehouseRow = {
  external_id: string;
  laudus_warehouse_id: number;
  name: string | null;
};

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json(
      { error: 'La sincronizacion de stock Laudus requiere permisos de administracion.' },
      { status: 403 },
    );
  }

  const supabase = getSupabaseServerClient();
  const observedAt = new Date().toISOString();
  const dateTo = new Date()
    .toLocaleString('sv-SE', { timeZone: 'America/Santiago', hour12: false })
    .replace(' ', 'T');

  const { data: warehouses, error: warehouseError } = await supabase
    .schema('integration')
    .from('laudus_warehouses')
    .select('external_id,laudus_warehouse_id,name')
    .eq('organization_id', access.organizationId)
    .order('laudus_warehouse_id');

  if (warehouseError) {
    console.error('[laudus/stock/sync] warehouses', warehouseError.message);
    return NextResponse.json({ error: 'No fue posible leer las bodegas Laudus.' }, { status: 500 });
  }

  const rows = (warehouses || []) as WarehouseRow[];
  if (!rows.length) {
    return NextResponse.json({ error: 'No hay bodegas Laudus disponibles para sincronizar.' }, { status: 409 });
  }

  let runId: string | null = null;
  let calls = 0;
  let staged = 0;
  let inserted = 0;
  let changed = 0;
  let unchanged = 0;
  let productResolved = 0;
  let productUnresolved = 0;
  const warehouseResults: Array<Record<string, unknown>> = [];

  for (let warehouseIndex = 0; warehouseIndex < rows.length; warehouseIndex += 1) {
    const warehouse = rows[warehouseIndex];
    const apiWarehouseId = warehouse.external_id;
    const payload = await getLaudusStockSnapshot({
      dateTo,
      warehouseId: apiWarehouseId,
    });
    calls += 1;

    const normalized = toLaudusStockStageRows(payload, apiWarehouseId);
    const chunks = chunkLaudusStockRows(normalized.rows, 500);

    if (!chunks.length) {
      warehouseResults.push({
        warehouseExternalId: warehouse.external_id,
        warehouseId: warehouse.laudus_warehouse_id,
        name: warehouse.name,
        rows: 0,
      });
      continue;
    }

    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
      const isLastWarehouse = warehouseIndex === rows.length - 1;
      const isLastChunk = chunkIndex === chunks.length - 1;
      const { data, error } = await supabase.rpc('motil_ingest_laudus_product_stock', {
        p_organization_id: access.organizationId,
        p_warehouse_external_id: warehouse.external_id,
        p_date_to: observedAt,
        p_rows: chunks[chunkIndex],
        p_run_id: runId,
        p_finalize: isLastWarehouse && isLastChunk,
      });

      if (error) {
        console.error('[laudus/stock/sync] stage', {
          warehouse: warehouse.external_id,
          message: error.message,
        });
        return NextResponse.json(
          {
            status: 'partial',
            calls,
            runId,
            warehouseExternalId: warehouse.external_id,
            staged,
            error: 'La lectura Laudus fue correcta, pero no fue posible completar el staging.',
          },
          { status: 500 },
        );
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

    warehouseResults.push({
      warehouseExternalId: warehouse.external_id,
      warehouseId: warehouse.laudus_warehouse_id,
      name: warehouse.name,
      rows: normalized.rows.length,
    });
  }

  return NextResponse.json({
    status: 'ok',
    source: 'Laudus',
    mode: 'read_only',
    calls,
    runId,
    dateTo,
    warehouses: warehouseResults,
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
