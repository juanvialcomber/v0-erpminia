export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { listLaudus } from '@/lib/integrations/laudus/client';
import { extractLaudusListRows, hasLaudusPageMore } from '@/lib/integrations/laudus/financial-masters';

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

function mergeById(
  groups: Array<Record<string, unknown>[]>,
  idField: string,
) {
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

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;

  if (!access.admin) {
    return NextResponse.json(
      { error: 'La sincronización de maestros Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  const costCenters = await fetchAll('/purchases/costcenters/list', COST_CENTER_FIELDS);
  const fixedAssetGroups = [];
  let fixedAssetCalls = 0;

  for (const fields of FIXED_ASSET_FIELD_GROUPS) {
    const group = await fetchAll('/purchases/fixedAssets/list', fields);
    fixedAssetGroups.push(group.rows);
    fixedAssetCalls += group.calls;
  }

  const fixedAssets = mergeById(fixedAssetGroups, 'fixedAssetId');
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.rpc('motil_ingest_laudus_financial_masters', {
    p_organization_id: access.organizationId,
    p_cost_centers: costCenters.rows,
    p_fixed_assets: fixedAssets,
  });

  let reconciliation: unknown = null;
  if (!error) {
    const reconciliationResult = await supabase.rpc('motil_reconcile_laudus_financial_masters', {
      p_organization_id: access.organizationId,
    });
    if (reconciliationResult.error) {
      console.error('[laudus/financial-masters/reconcile]', reconciliationResult.error.message);
      return NextResponse.json(
        {
          status: 'partial',
          source: 'Laudus',
          mode: 'read_only',
          calls: costCenters.calls + fixedAssetCalls + 2,
          costCentersRead: costCenters.rows.length,
          fixedAssetsRead: fixedAssets.length,
          canonicalMutated: false,
          laudusMutated: false,
          error: 'Los maestros fueron staged, pero la conciliación requiere revisión.',
        },
        { status: 500 },
      );
    }
    reconciliation = reconciliationResult.data;
  }

  const calls = costCenters.calls + fixedAssetCalls + 2;

  if (error) {
    console.error('[laudus/financial-masters/sync]', error.message);
    return NextResponse.json(
      {
        status: 'partial',
        source: 'Laudus',
        mode: 'read_only',
        calls,
        costCentersRead: costCenters.rows.length,
        fixedAssetsRead: fixedAssets.length,
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
    calls,
    costCentersRead: costCenters.rows.length,
    fixedAssetsRead: fixedAssets.length,
    acquisitionCostStrategy: 'targeted_detail_after_identity_match',
    result: data,
    reconciliation,
    canonicalMutated: false,
    laudusMutated: false,
  });
}
