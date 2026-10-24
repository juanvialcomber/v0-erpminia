export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { describeLaudusPayloadShape, LaudusApiError, listLaudus, listLaudusSerialized } from '@/lib/integrations/laudus/client';

const TARGETS = [
  {
    key: 'costCenters',
    path: '/purchases/costcenters/list',
    fields: ['costCenterId', 'code', 'name', 'fullPath', 'parentId', 'discontinued'],
  },
  {
    key: 'fixedAssets',
    path: '/purchases/fixedAssets/list',
    fields: [
      'fixedAssetId', 'name', 'dateAcquisition', 'dateRetirement', 'acquisitionCost',
      'usefulLife', 'realizableValue', 'depreciationType', 'manufacturer', 'model',
      'serialNumber', 'supplier', 'invoiceNumber', 'location',
    ],
  },
] as const;

async function attempt(path: string, fields: string[], serialized: boolean, explicitFields: boolean) {
  try {
    const fn = serialized ? listLaudusSerialized : listLaudus;
    const payload = await fn(path, {
      options: { offset: 0, limit: 5 },
      fields: explicitFields ? fields : [],
    });
    return {
      status: 'ok',
      serialized,
      explicitFields,
      ...describeLaudusPayloadShape(payload),
    };
  } catch (error) {
    const e = error instanceof LaudusApiError ? error : null;
    return {
      status: 'failed',
      serialized,
      explicitFields,
      upstreamStatus: e?.status ?? null,
      upstreamCode: e?.upstreamCode ?? null,
    };
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const results: Record<string, unknown> = {};
  let calls = 0;

  for (const target of TARGETS) {
    const variants = [];
    for (const serialized of [false, true]) {
      for (const explicitFields of [false, true]) {
        variants.push(await attempt(target.path, [...target.fields], serialized, explicitFields));
        calls += 1;
      }
    }
    results[target.key] = variants;
  }

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_contract_probe',
    persisted: false,
    calls: calls + 1,
    results,
  });
}
