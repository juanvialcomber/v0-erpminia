export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { LaudusApiError, listLaudus } from '@/lib/integrations/laudus/client';

const COST_CENTER_FIELDS = [
  'costCenterId','code','name','fullPath','parentId','discontinued',
] as const;

const FIXED_ASSET_FIELDS = [
  'fixedAssetId','name','dateAcquisition','dateRetirement',
  'usefulLife','realizableValue','depreciationType','depreciate',
  'depreciateFromMonthOfAcquisition','taxDeductionPercentage',
  'manufacturer','model','serialNumber','supplier','invoiceNumber','location',
] as const;

function summarize(payload: unknown) {
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? ((['data','items','results','rows']
          .map((key) => (payload as Record<string, unknown>)[key])
          .find(Array.isArray) as unknown[] | undefined) || [])
      : [];

  const first = rows[0];
  return {
    rows: rows.length,
    sampleFields:
      first && typeof first === 'object' && !Array.isArray(first)
        ? Object.keys(first as Record<string, unknown>).sort()
        : [],
  };
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not available.' }, { status: 404 });
  }

  try {
    const [costCenters, fixedAssets] = await Promise.all([
      listLaudus('/purchases/costcenters/list', {
        options: { offset: 0, limit: 5 },
        fields: [...COST_CENTER_FIELDS],
        orderBy: [{ field: COST_CENTER_FIELDS[0], direction: 'ASC' }],
      }),
      listLaudus('/purchases/fixedAssets/list', {
        options: { offset: 0, limit: 5 },
        fields: [...FIXED_ASSET_FIELDS],
        orderBy: [{ field: FIXED_ASSET_FIELDS[0], direction: 'ASC' }],
      }),
    ]);

    return NextResponse.json({
      status: 'ok',
      persisted: false,
      laudusMutated: false,
      costCenters: summarize(costCenters),
      fixedAssets: summarize(fixedAssets),
    });
  } catch (error) {
    const laudusError = error instanceof LaudusApiError ? error : null;
    return NextResponse.json({
      status: 'failed',
      persisted: false,
      laudusMutated: false,
      stage: laudusError?.path || null,
      upstreamStatus: laudusError?.status || null,
      upstreamCode: laudusError?.upstreamCode || null,
      message: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 502 });
  }
}
