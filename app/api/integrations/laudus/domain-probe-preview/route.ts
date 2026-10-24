export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listLaudus } from '@/lib/integrations/laudus/client';
import { extractLaudusListRows, hasLaudusPageMore } from '@/lib/integrations/laudus/financial-masters';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const ORGANIZATION_ID = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';
const PAGE_SIZE = 25;
const MAX_PAGES = 200;

const COST_CENTER_FIELDS = [
  'costCenterId', 'code', 'name', 'fullPath', 'parentId', 'discontinued',
];

const FIXED_ASSET_FIELD_GROUPS = [
  ['fixedAssetId', 'name', 'dateAcquisition', 'dateRetirement', 'usefulLife', 'realizableValue'],
  ['fixedAssetId', 'name', 'depreciationType', 'depreciate', 'depreciateFromMonthOfAcquisition', 'taxDeductionPercentage'],
  ['fixedAssetId', 'name', 'manufacturer', 'model', 'serialNumber', 'location'],
  ['fixedAssetId', 'name', 'supplier', 'invoiceNumber'],
] as const;

async function fetchAll(path: string, fields: readonly string[]) {
  const rows: Record<string, unknown>[] = [];
  let calls = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await listLaudus(path, {
      options: { offset: page * PAGE_SIZE, limit: PAGE_SIZE },
      fields: [...fields],
    });
    calls += 1;
    const batch = extractLaudusListRows(payload);
    rows.push(...batch);
    if (!hasLaudusPageMore(batch, PAGE_SIZE)) break;
  }
  return { rows, calls };
}

function mergeById(groups: Array<Record<string, unknown>[]>, idField: string) {
  const merged = new Map<string, Record<string, unknown>>();
  for (const rows of groups) {
    for (const row of rows) {
      const id = String(row[idField] ?? '').trim();
      if (!id) continue;
      merged.set(id, { ...(merged.get(id) || {}), ...row });
    }
  }
  return [...merged.values()];
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const costCenters = await fetchAll('/purchases/costcenters/list', COST_CENTER_FIELDS);
  const groups: Array<Record<string, unknown>[]> = [];
  let fixedAssetCalls = 0;
  for (const fields of FIXED_ASSET_FIELD_GROUPS) {
    const result = await fetchAll('/purchases/fixedAssets/list', fields);
    groups.push(result.rows);
    fixedAssetCalls += result.calls;
  }
  const fixedAssets = mergeById(groups, 'fixedAssetId');

  const db = getSupabaseServerClient();
  const { data, error } = await db.rpc('motil_ingest_laudus_financial_masters', {
    p_organization_id: ORGANIZATION_ID,
    p_cost_centers: costCenters.rows,
    p_fixed_assets: fixedAssets,
  });

  if (error) {
    return NextResponse.json({
      status: 'failed',
      mode: 'read_only_preview_one_shot',
      calls: costCenters.calls + fixedAssetCalls + 1,
      costCentersRead: costCenters.rows.length,
      fixedAssetsRead: fixedAssets.length,
      databaseCode: error.code || null,
      canonicalMutated: false,
      laudusMutated: false,
    }, { status: 500 });
  }

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_preview_one_shot',
    calls: costCenters.calls + fixedAssetCalls + 1,
    costCentersRead: costCenters.rows.length,
    fixedAssetsRead: fixedAssets.length,
    acquisitionCostStrategy: 'targeted_detail_after_identity_match',
    result: data,
    canonicalMutated: false,
    laudusMutated: false,
  });
}
