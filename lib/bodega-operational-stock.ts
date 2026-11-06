type SupabaseClientLike = any;

export type BodegaOperationalQuantity = {
  canonical_product_id: string;
  operational_quantity: number | string | null;
  operational_resolution: string | null;
  reconciliation_state: string | null;
  laudus_stock_date: string | null;
  laudus_synced_at: string | null;
};

const CHUNK_SIZE = 250;

export async function loadBodegaOperationalQuantities(
  supabase: SupabaseClientLike,
  organizationId: string | null | undefined,
  canonicalProductIds: string[],
): Promise<Map<string, BodegaOperationalQuantity>> {
  const ids = [...new Set(canonicalProductIds.map((value) => String(value || '').trim()).filter(Boolean))];
  const result = new Map<string, BodegaOperationalQuantity>();
  if (!organizationId || ids.length === 0) return result;

  for (let offset = 0; offset < ids.length; offset += CHUNK_SIZE) {
    const chunk = ids.slice(offset, offset + CHUNK_SIZE);
    const { data, error } = await supabase
      .from('bodega_inventory_operational_service_v1')
      .select('canonical_product_id,operational_quantity,operational_resolution,reconciliation_state,laudus_stock_date,laudus_synced_at')
      .eq('organization_id', organizationId)
      .in('canonical_product_id', chunk);

    if (error) throw error;
    for (const row of data || []) {
      if (!row?.canonical_product_id) continue;
      result.set(String(row.canonical_product_id), row as BodegaOperationalQuantity);
    }
  }

  return result;
}

export function resolvedOperationalQuantity(
  fallbackQuantity: unknown,
  operational?: BodegaOperationalQuantity | null,
) {
  const operationalValue = operational?.operational_quantity;
  if (operationalValue !== null && operationalValue !== undefined && operationalValue !== '') {
    const parsed = Number(operationalValue);
    if (Number.isFinite(parsed)) return parsed;
  }

  const fallback = Number(fallbackQuantity);
  return Number.isFinite(fallback) ? fallback : 0;
}
