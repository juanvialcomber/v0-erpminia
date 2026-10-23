export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { listLaudus } from '@/lib/integrations/laudus/client';
import {
  type LaudusProductRecord,
  summarizeLaudusProducts,
} from '@/lib/integrations/laudus/product-intelligence';

const EXPECTED_BRANCH = 'feat/laudus-product-intelligence-20261023';

function rowsFromPayload(payload: unknown): LaudusProductRecord[] {
  if (Array.isArray(payload)) return payload as LaudusProductRecord[];
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'rows']) {
      if (Array.isArray(record[key])) return record[key] as LaudusProductRecord[];
    }
  }
  return [];
}

function boundedNumber(value: string | null, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

export async function GET(request: NextRequest) {
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const isExpectedBranch = process.env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;
  if (!isPreview || !isExpectedBranch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const offset = boundedNumber(request.nextUrl.searchParams.get('offset'), 0, 0, 1000000);
  const limit = boundedNumber(request.nextUrl.searchParams.get('limit'), 500, 1, 500);

  try {
    const payload = await listLaudus('/production/products/list', {
      options: { offset, limit },
      fields: ['productId', 'SKU', 'description', 'unitOfMeasure'],
      filterBy: [],
      orderBy: [{ field: 'productId', direction: 'ASC' }],
    });

    const rows = rowsFromPayload(payload);
    const intelligence = summarizeLaudusProducts(rows);

    return NextResponse.json({
      status: 'ok',
      source: 'laudus',
      persisted: false,
      offset,
      limit,
      rowsRead: rows.length,
      nextOffset: rows.length === limit ? offset + rows.length : null,
      intelligence,
    });
  } catch (error) {
    console.error('[laudus/product-intelligence-preview]', error);
    return NextResponse.json(
      {
        status: 'failed',
        source: 'laudus',
        persisted: false,
        offset,
        limit,
        error: error instanceof Error ? error.message : 'No fue posible procesar productos Laudus.',
      },
      { status: 502 },
    );
  }
}
