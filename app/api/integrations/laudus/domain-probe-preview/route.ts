export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listLaudus } from '@/lib/integrations/laudus/client';
import { extractLaudusListRows, hasLaudusPageMore } from '@/lib/integrations/laudus/financial-masters';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const ORGANIZATION_ID = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';
const PAGE_SIZE = 25;
const MAX_PAGES = 200;

async function fetchAll(path: string) {
  const rows: Record<string, unknown>[] = [];
  let calls = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const payload = await listLaudus(path, {
      options: { offset: page * PAGE_SIZE, limit: PAGE_SIZE },
    });
    calls += 1;
    const batch = extractLaudusListRows(payload);
    rows.push(...batch);
    if (!hasLaudusPageMore(batch, PAGE_SIZE)) break;
  }

  return { rows, calls };
}

function keys(rows: Record<string, unknown>[]) {
  return rows.length ? Object.keys(rows[0]).sort().slice(0, 60) : [];
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [costCenters, fixedAssets] = await Promise.all([
    fetchAll('/purchases/costcenters/list'),
    fetchAll('/purchases/fixedAssets/list'),
  ]);

  const db = getSupabaseServerClient();
  const { data, error } = await db.rpc('motil_ingest_laudus_financial_masters', {
    p_organization_id: ORGANIZATION_ID,
    p_cost_centers: costCenters.rows,
    p_fixed_assets: fixedAssets.rows,
  });

  if (error) {
    return NextResponse.json({
      status: 'failed',
      mode: 'read_only_preview_one_shot',
      calls: costCenters.calls + fixedAssets.calls + 1,
      costCentersRead: costCenters.rows.length,
      fixedAssetsRead: fixedAssets.rows.length,
      canonicalMutated: false,
      laudusMutated: false,
      databaseCode: error.code || null,
    });
  }

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_preview_one_shot',
    calls: costCenters.calls + fixedAssets.calls + 1,
    costCentersRead: costCenters.rows.length,
    fixedAssetsRead: fixedAssets.rows.length,
    costCenterKeys: keys(costCenters.rows),
    fixedAssetKeys: keys(fixedAssets.rows),
    result: data,
    canonicalMutated: false,
    laudusMutated: false,
  });
}
