export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLaudusAccessToken, listLaudus } from '@/lib/integrations/laudus/client';

const EXPECTED_BRANCH = 'test/laudus-smoke-preview-20261023';

export async function GET() {
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const isExpectedBranch = process.env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;

  if (!isPreview || !isExpectedBranch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    await getLaudusAccessToken();

    const pageSize = 25;
    const maxPages = 10;
    const products: unknown[] = [];
    let calls = 1;

    for (let page = 0; page < maxPages; page += 1) {
      const payload = await listLaudus('/production/products/list', {
        options: { offset: page * pageSize, limit: pageSize },
        fields: ['productId', 'SKU', 'description', 'unitOfMeasure'],
        filterBy: [],
        orderBy: [{ field: 'productId', direction: 'ASC' }],
      });
      calls += 1;

      const rows = Array.isArray(payload)
        ? payload
        : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown[] }).data)
          ? (payload as { data: unknown[] }).data
          : [];

      products.push(...rows);
      if (rows.length < pageSize) break;
    }

    return NextResponse.json({
      status: 'ok',
      authenticated: true,
      persisted: false,
      domain: 'products',
      calls,
      rowsRead: products.length,
      first: products.slice(0, 5),
      last: products.slice(-5),
      truncated: products.length === pageSize * maxPages,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'failed',
        persisted: false,
        domain: 'products',
        error: error instanceof Error ? error.message : 'Laudus product read failed.',
      },
      { status: 502 },
    );
  }
}
