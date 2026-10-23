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
    const products = await listLaudus('/production/products/list', {
      options: { offset: 0, limit: 5 },
      fields: ['productId', 'SKU', 'description', 'unitOfMeasure'],
      filterBy: [],
      orderBy: [{ field: 'productId', direction: 'ASC' }],
    });

    return NextResponse.json({
      status: 'ok',
      authenticated: true,
      calls: 2,
      persisted: false,
      domain: 'products',
      sample: products,
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
