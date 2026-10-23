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
    const payload = await listLaudus('/production/products/list', {
      options: { offset: 13100, limit: 259 },
      fields: ['productId', 'SKU', 'description', 'unitOfMeasure'],
      filterBy: [],
      orderBy: [{ field: 'productId', direction: 'ASC' }],
    });

    const rows = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown[] }).data)
        ? (payload as { data: unknown[] }).data
        : [];

    return NextResponse.json({
      status: 'ok',
      authenticated: true,
      persisted: false,
      calls: 2,
      offset: 13100,
      rowsRead: rows.length,
      rows,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'failed',
        persisted: false,
        error: error instanceof Error ? error.message : 'Laudus tail read failed.',
      },
      { status: 502 },
    );
  }
}
