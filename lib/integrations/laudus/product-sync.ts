import { listLaudus } from '@/lib/integrations/laudus/client';
import { LAUDUS_SYNC_POLICIES } from '@/lib/integrations/laudus/sync-policy';

const PRODUCT_PATH = '/production/products/list';
const PRODUCT_FIELDS = ['productId', 'SKU', 'description', 'unitOfMeasure'] as const;
const PRODUCT_HEAD_PAGES_PER_RUN = 5;

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

export async function syncLaudusProducts(organizationId: string, supabase: any) {
  const policy = LAUDUS_SYNC_POLICIES.product;
  let runId: string | null = null;
  let apiCalls = 0;
  let processed = 0;
  let inserted = 0;
  let changed = 0;
  let unchanged = 0;
  let matched = 0;
  let newCandidate = 0;
  let conflict = 0;

  // Products are already bootstrapped. Poll the newest 500 IDs on each run so new SKUs
  // are caught quickly without burning the 2,000-call monthly Laudus allowance.
  for (let page = 0; page < PRODUCT_HEAD_PAGES_PER_RUN; page += 1) {
    const payload = await listLaudus(PRODUCT_PATH, {
      options: { offset: page * policy.pageSize, limit: policy.pageSize },
      fields: [...PRODUCT_FIELDS],
      orderBy: [{ field: 'productId', direction: 'DESC' }],
    });
    apiCalls += 1;

    const rows = rowsFromPayload(payload);
    const isFinalPage = rows.length < policy.pageSize || page + 1 >= PRODUCT_HEAD_PAGES_PER_RUN;

    if (rows.length) {
      const { data, error } = await supabase.rpc('motil_ingest_laudus_products', {
        p_organization_id: organizationId,
        p_rows: rows,
        p_run_id: runId,
        p_finalize: isFinalPage,
      });

      if (error) throw new Error('Laudus product master staging failed');

      const result = (data || {}) as Record<string, unknown>;
      if (!runId && typeof result.run_id === 'string') runId = result.run_id;
      processed += Number(result.batch_rows || 0);
      inserted += Number(result.inserted || 0);
      changed += Number(result.changed || 0);
      unchanged += Number(result.unchanged || 0);
      matched += Number(result.matched || 0);
      newCandidate += Number(result.new_candidate || 0);
      conflict += Number(result.conflict || 0);
    }

    if (isFinalPage) break;
  }

  return {
    status: 'completed' as const,
    organizationId,
    runId,
    apiCalls,
    processed,
    inserted,
    changed,
    unchanged,
    matched,
    newCandidate,
    conflict,
    canonicalProductsMutated: false,
    laudusMutated: false,
  };
}
