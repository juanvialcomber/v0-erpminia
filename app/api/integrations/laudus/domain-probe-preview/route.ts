export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { describeLaudusPayloadShape, LaudusApiError, listLaudus } from '@/lib/integrations/laudus/client';

const FIXED_ASSET_FIELD_SETS = [
  ['fixedAssetId'],
  ['fixedAssetId', 'name'],
  ['fixedAssetId', 'name', 'dateAcquisition', 'dateRetirement', 'acquisitionCost', 'usefulLife', 'realizableValue'],
  ['fixedAssetId', 'name', 'depreciationType', 'depreciate', 'depreciateFromMonthOfAcquisition', 'taxDeductionPercentage'],
  ['fixedAssetId', 'name', 'manufacturer', 'model', 'serialNumber', 'location'],
  ['fixedAssetId', 'name', 'supplier'],
  ['fixedAssetId', 'name', 'invoiceNumber'],
] as const;

async function attempt(path: string, fields: readonly string[]) {
  try {
    const payload = await listLaudus(path, {
      options: { offset: 0, limit: 5 },
      fields: [...fields],
    });
    return {
      status: 'ok',
      fields,
      ...describeLaudusPayloadShape(payload),
    };
  } catch (error) {
    const e = error instanceof LaudusApiError ? error : null;
    return {
      status: 'failed',
      fields,
      upstreamStatus: e?.status ?? null,
      upstreamCode: e?.upstreamCode ?? null,
    };
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const costCenters = await attempt('/purchases/costcenters/list', [
    'costCenterId', 'code', 'name', 'fullPath', 'parentId', 'discontinued',
  ]);

  const fixedAssets = [];
  for (const fields of FIXED_ASSET_FIELD_SETS) {
    fixedAssets.push(await attempt('/purchases/fixedAssets/list', fields));
  }

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_contract_probe',
    persisted: false,
    calls: 1 + FIXED_ASSET_FIELD_SETS.length + 1,
    results: { costCenters, fixedAssets },
  });
}
