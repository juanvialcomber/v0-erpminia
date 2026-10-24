export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { listLaudus } from '@/lib/integrations/laudus/client';
import { extractLaudusListRows, hasLaudusPageMore } from '@/lib/integrations/laudus/financial-masters';

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

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;

  if (!access.admin) {
    return NextResponse.json(
      { error: 'La sincronización de maestros Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  const [costCenters, fixedAssets] = await Promise.all([
    fetchAll('/purchases/costcenters/list'),
    fetchAll('/purchases/fixedAssets/list'),
  ]);

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('motil_ingest_laudus_financial_masters', {
    p_organization_id: access.organizationId,
    p_cost_centers: costCenters.rows,
    p_fixed_assets: fixedAssets.rows,
  });

  if (error) {
    console.error('[laudus/financial-masters/sync]', error.message);
    return NextResponse.json(
      {
        status: 'partial',
        source: 'Laudus',
        mode: 'read_only',
        calls: costCenters.calls + fixedAssets.calls + 1,
        costCentersRead: costCenters.rows.length,
        fixedAssetsRead: fixedAssets.rows.length,
        canonicalMutated: false,
        laudusMutated: false,
        error: 'La lectura Laudus fue correcta, pero no fue posible completar el staging.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: 'ok',
    source: 'Laudus',
    mode: 'read_only',
    calls: costCenters.calls + fixedAssets.calls + 1,
    costCentersRead: costCenters.rows.length,
    fixedAssetsRead: fixedAssets.rows.length,
    result: data,
    canonicalMutated: false,
    laudusMutated: false,
  });
}
