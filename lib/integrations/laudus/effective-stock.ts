type LaudusAuthorityRow = {
  authority_state: string | null;
  authority_reason: string | null;
  latest_laudus_stock_sync: string | null;
};

type LaudusStockRow = {
  sku: string | null;
  laudus_stock: number | string | null;
};

export type LaudusEffectiveStock = {
  isPrimary: boolean;
  authorityState: string;
  authorityReason: string | null;
  latestSync: string | null;
  stockBySku: Map<string, number>;
};

function normalizeSku(value: unknown) {
  return String(value || '').trim().toUpperCase();
}

export async function loadLaudusEffectiveStock(
  supabase: any,
  organizationId: string,
  skus?: Array<string | null | undefined>,
): Promise<LaudusEffectiveStock> {
  const { data: authority, error: authorityError } = await supabase
    .from('bodega_stock_source_authority_service_v1')
    .select('authority_state,authority_reason,latest_laudus_stock_sync')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (authorityError) throw authorityError;

  const authorityRow = (authority || null) as LaudusAuthorityRow | null;
  const authorityState = authorityRow?.authority_state || 'review_laudus_unavailable';
  const isPrimary = authorityState === 'laudus_primary';

  if (!isPrimary) {
    return {
      isPrimary: false,
      authorityState,
      authorityReason: authorityRow?.authority_reason || null,
      latestSync: authorityRow?.latest_laudus_stock_sync || null,
      stockBySku: new Map(),
    };
  }

  const requestedSkus = [...new Set((skus || []).map(normalizeSku).filter(Boolean))];
  const rows: LaudusStockRow[] = [];

  if (requestedSkus.length > 0 && requestedSkus.length <= 500) {
    const { data, error } = await supabase
      .from('laudus_inventory_reconciliation_service_v1')
      .select('sku,laudus_stock')
      .eq('organization_id', organizationId)
      .in('sku', requestedSkus);

    if (error) throw error;
    rows.push(...((data || []) as LaudusStockRow[]));
  } else {
    const pageSize = 1000;
    let start = 0;

    while (true) {
      const { data, error } = await supabase
        .from('laudus_inventory_reconciliation_service_v1')
        .select('sku,laudus_stock')
        .eq('organization_id', organizationId)
        .order('sku')
        .range(start, start + pageSize - 1);

      if (error) throw error;
      const batch = (data || []) as LaudusStockRow[];
      rows.push(...batch);
      if (batch.length < pageSize) break;
      start += pageSize;
    }
  }

  const stockBySku = new Map<string, number>();
  for (const row of rows) {
    const sku = normalizeSku(row.sku);
    const quantity = Number(row.laudus_stock);
    if (sku && Number.isFinite(quantity)) stockBySku.set(sku, quantity);
  }

  return {
    isPrimary: true,
    authorityState,
    authorityReason: authorityRow?.authority_reason || null,
    latestSync: authorityRow?.latest_laudus_stock_sync || null,
    stockBySku,
  };
}
