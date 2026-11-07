import { getLaudus } from '@/lib/integrations/laudus/client';

const MAX_PRODUCTS = 10;
const MONTHLY_RESERVE = 200;
const FRESH_HOURS = 24;

function rowsFrom(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'rows']) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    }
  }
  return [];
}

export async function syncNegativeLaudusKardex(organizationId: string, supabase: any) {
  const { data: budget, error: budgetError } = await supabase
    .from('laudus_api_budget_service_v1')
    .select('tracked_remaining,monthly_remaining_exact')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (budgetError || budget?.monthly_remaining_exact !== true) {
    return { status: 'skipped' as const, reason: 'budget_not_exact', requested: 0, persisted: 0 };
  }

  const remaining = Number(budget?.tracked_remaining || 0);
  if (!Number.isFinite(remaining) || remaining - MAX_PRODUCTS < MONTHLY_RESERVE) {
    return { status: 'skipped' as const, reason: 'monthly_reserve', requested: 0, persisted: 0 };
  }

  const { data: negatives, error: negativeError } = await supabase
    .from('laudus_negative_stock_positions_service_v1')
    .select('product_external_id,sku,total_laudus_stock,synced_at')
    .eq('organization_id', organizationId)
    .order('total_laudus_stock', { ascending: true })
    .limit(MAX_PRODUCTS);

  if (negativeError) {
    return { status: 'skipped' as const, reason: 'negative_lookup_failed', requested: 0, persisted: 0 };
  }

  const unique = new Map<string, { sku: string | null; syncedAt: string | null }>();
  for (const row of negatives || []) {
    const productId = String(row.product_external_id || '').trim();
    if (!/^[0-9]{1,18}$/.test(productId) || unique.has(productId)) continue;
    unique.set(productId, {
      sku: row.sku ? String(row.sku) : null,
      syncedAt: row.synced_at ? String(row.synced_at) : null,
    });
  }

  if (!unique.size) {
    return { status: 'empty' as const, requested: 0, persisted: 0, products: [] };
  }

  const productIds = [...unique.keys()];
  const freshnessCutoff = new Date(Date.now() - FRESH_HOURS * 60 * 60 * 1000).toISOString();
  const { data: freshRows } = await supabase
    .schema('integration')
    .from('laudus_product_kardex')
    .select('product_external_id,synced_at')
    .eq('organization_id', organizationId)
    .in('product_external_id', productIds)
    .gte('synced_at', freshnessCutoff);

  const fresh = new Set((freshRows || []).map((row: any) => String(row.product_external_id || '')).filter(Boolean));
  const targets = productIds.filter((id) => !fresh.has(id)).slice(0, MAX_PRODUCTS);

  let requested = 0;
  let persisted = 0;
  const products: Array<Record<string, unknown>> = [];

  for (const productId of targets) {
    try {
      const payload = await getLaudus(`/production/products/${encodeURIComponent(productId)}/kardex`);
      requested += 1;
      const rows = rowsFrom(payload);
      if (rows.length > 500) {
        products.push({ productId, sku: unique.get(productId)?.sku || null, status: 'too_large', movements: rows.length });
        continue;
      }

      const { data, error } = await supabase.rpc('motil_ingest_laudus_product_kardex', {
        p_organization_id: organizationId,
        p_product_external_id: productId,
        p_rows: rows,
      });
      if (error) {
        products.push({ productId, sku: unique.get(productId)?.sku || null, status: 'persist_failed', movements: rows.length });
        continue;
      }

      persisted += rows.length;
      products.push({
        productId,
        sku: unique.get(productId)?.sku || null,
        status: 'completed',
        movements: rows.length,
        result: data || {},
      });
    } catch (error) {
      requested += 1;
      products.push({
        productId,
        sku: unique.get(productId)?.sku || null,
        status: 'failed',
        error: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  return {
    status: 'completed' as const,
    requested,
    persisted,
    skippedFresh: fresh.size,
    products,
    canonicalMutated: false,
    laudusMutated: false,
  };
}
