export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { runLaudusReadOnlySmokeTest } from '@/lib/integrations/laudus/client';

const EXPECTED_BRANCH = 'test/laudus-smoke-preview-20261023';

export async function GET() {
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const isExpectedBranch = process.env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;

  if (!isPreview || !isExpectedBranch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const result = await runLaudusReadOnlySmokeTest();
    return NextResponse.json({
      status: 'ok',
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'failed',
        persisted: false,
        error: error instanceof Error ? error.message : 'Laudus smoke failed.',
      },
      { status: 502 },
    );
  }
}
