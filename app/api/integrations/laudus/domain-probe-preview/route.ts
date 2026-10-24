export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { describeLaudusPayloadShape, LaudusApiError, listLaudus } from '@/lib/integrations/laudus/client';

const FIELDS = [
  'dateAcquisition',
  'dateRetirement',
  'acquisitionCost',
  'usefulLife',
  'realizableValue',
] as const;

async function attempt(field: string) {
  try {
    const payload = await listLaudus('/purchases/fixedAssets/list', {
      options: { offset: 0, limit: 5 },
      fields: ['fixedAssetId', 'name', field],
    });
    return { field, status: 'ok', ...describeLaudusPayloadShape(payload) };
  } catch (error) {
    const e = error instanceof LaudusApiError ? error : null;
    return { field, status: 'failed', upstreamStatus: e?.status ?? null, upstreamCode: e?.upstreamCode ?? null };
  }
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const fixedAssets = [];
  for (const field of FIELDS) fixedAssets.push(await attempt(field));

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_contract_probe',
    persisted: false,
    calls: FIELDS.length + 1,
    fixedAssets,
  });
}
