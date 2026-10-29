import { listLaudus } from '@/lib/integrations/laudus/client';
import { LAUDUS_SYNC_POLICIES, markLaudusSyncFailure, markLaudusSyncRunning, markLaudusSyncSuccess } from '@/lib/integrations/laudus/sync-policy';

const COST_CENTER_PATH = '/purchases/costcenters/list';
const FIXED_ASSET_PATH = '/purchases/fixedAssets/list';

// Keep list projections aligned with fields observed in successful Laudus payloads.
// Unknown fields make Laudus return HTTP 422, so do not request optional guesses here.
const COST_CENTER_FIELDS = [
  'costCenterId','code','name','fullPath','parentId','discontinued',
] as const;

const FIXED_ASSET_FIELDS = [
  'fixedAssetId','name','dateAcquisition','dateRetirement',
  'usefulLife','realizableValue','depreciationType','depreciate',
  'depreciateFromMonthOfAcquisition','taxDeductionPercentage',
  'manufacturer','model','serialNumber','supplier','invoiceNumber','location',
] as const;

function rowsFromPayload(payload: unknown): Record<string, unknown>[] {
  const rows =
    Array.isArray(payload) ? payload :
    payload && typeof payload === 'object'
      ? (['data','items','results','rows']
          .map((key) => (payload as Record<string, unknown>)[key])
          .find(Array.isArray) as unknown[] | undefined) || []
      : [];
  return rows.filter((row): row is Record<string, unknown> =>
    Boolean(row && typeof row === 'object' && !Array.isArray(row)));
}

async function fetchAll(
  path: string,
  fields: readonly string[],
  policyKey: 'cost_center' | 'fixed_asset',
) {
  const policy = LAUDUS_SYNC_POLICIES[policyKey];
  const rows: Record<string, unknown>[] = [];
  let calls = 0;

  for (let page = 0; page < policy.maxPagesPerRun; page += 1) {
    const payload = await listLaudus(path, {
      options: { offset: page * policy.pageSize, limit: policy.pageSize },
      fields: [...fields],
      orderBy: [{ field: fields[0], direction: 'ASC' }],
    });
    calls += 1;
    const pageRows = rowsFromPayload(payload);
    rows.push(...pageRows);
    if (pageRows.length < policy.pageSize) break;
  }

  return { rows, calls };
}

export async function syncLaudusFinancialMasters(
  organizationId: string,
  supabase: any,
) {
  await markLaudusSyncRunning(supabase, organizationId, 'financial_masters');
  try {
    const [costCenters, fixedAssets] = await Promise.all([
    fetchAll(COST_CENTER_PATH, COST_CENTER_FIELDS, 'cost_center'),
    fetchAll(FIXED_ASSET_PATH, FIXED_ASSET_FIELDS, 'fixed_asset'),
  ]);

  const { data: ingest, error: ingestError } = await supabase.rpc(
    'motil_ingest_laudus_financial_masters',
    {
      p_organization_id: organizationId,
      p_cost_centers: costCenters.rows,
      p_fixed_assets: fixedAssets.rows,
    },
  );
  if (ingestError) throw new Error('Laudus financial master ingest failed');

  const { data: reconciliation, error: reconciliationError } = await supabase.rpc(
    'motil_reconcile_laudus_financial_masters',
    { p_organization_id: organizationId },
  );
  if (reconciliationError) throw new Error('Laudus financial master reconciliation failed');

    const apiListCalls = costCenters.calls + fixedAssets.calls;
    await markLaudusSyncSuccess(supabase, organizationId, 'financial_masters', {
      processed: costCenters.rows.length + fixedAssets.rows.length,
      changed: 0,
      conflicts: 0,
      apiCalls: apiListCalls,
      metadata: { costCentersRead: costCenters.rows.length, fixedAssetsRead: fixedAssets.rows.length },
    });

    return {
    status: 'completed' as const,
    organizationId,
    apiListCalls,
    costCentersRead: costCenters.rows.length,
    fixedAssetsRead: fixedAssets.rows.length,
    ingest,
    reconciliation,
    laudusMutated: false,
    canonicalMutated: false,
    };
  } catch (error) {
    await markLaudusSyncFailure(supabase, organizationId, 'financial_masters', error);
    throw error;
  }
}
