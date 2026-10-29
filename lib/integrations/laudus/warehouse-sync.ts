import type { SupabaseClient } from '@supabase/supabase-js';
import { listLaudus } from '@/lib/integrations/laudus/client';
import {
  markLaudusSyncFailure,
  markLaudusSyncRunning,
  markLaudusSyncSuccess,
} from '@/lib/integrations/laudus/sync-policy';

const WAREHOUSE_PATH = '/production/warehouses/list';
const WAREHOUSE_FIELDS = ['warehouseId', 'name', 'address', 'county', 'city', 'state'] as const;

function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  const rows =
    Array.isArray(payload) ? payload :
    payload && typeof payload === 'object'
      ? (['data', 'items', 'results', 'rows']
          .map((key) => (payload as Record<string, unknown>)[key])
          .find(Array.isArray) as unknown[] | undefined) || []
      : [];

  return rows.filter((row): row is Record<string, unknown> =>
    Boolean(row && typeof row === 'object' && !Array.isArray(row)));
}

export async function syncLaudusWarehouses(
  organizationId: string,
  db: SupabaseClient,
) {
  await markLaudusSyncRunning(db, organizationId, 'warehouses');
  let apiCalls = 0;

  try {
    const payload = await listLaudus(WAREHOUSE_PATH, {
      options: { offset: 0, limit: 100 },
      fields: [...WAREHOUSE_FIELDS],
      orderBy: [{ field: 'warehouseId', direction: 'ASC' }],
    });
    apiCalls += 1;

    const rows = rowsFromPayload(payload);
    const { data, error } = await db.rpc('motil_ingest_laudus_warehouses', {
      p_organization_id: organizationId,
      p_rows: rows,
    });

    if (error) throw new Error('Laudus warehouse staging failed');

    const result = (data || {}) as Record<string, unknown>;
    const processed = Number(result.rows || rows.length || 0);
    const matched = Number(result.matched || 0);
    const newCandidate = Number(result.new_candidate || 0);
    const conflict = Number(result.conflict || 0);

    await markLaudusSyncSuccess(db, organizationId, 'warehouses', {
      processed,
      changed: 0,
      conflicts: newCandidate + conflict,
      apiCalls,
      metadata: {
        matched,
        newCandidate,
        conflict,
        readOnly: true,
        fullSnapshot: true,
      },
    });

    return {
      organizationId,
      status: 'completed' as const,
      processed,
      matched,
      newCandidate,
      conflict,
      apiCalls,
      laudusMutated: false,
      canonicalWarehousesMutated: false,
    };
  } catch (error) {
    await markLaudusSyncFailure(db, organizationId, 'warehouses', error, {
      apiCalls,
      metadata: { readOnly: true, fullSnapshot: true },
    });
    throw error;
  }
}
