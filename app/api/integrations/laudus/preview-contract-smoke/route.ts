export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { runLaudusReadOnlySmokeTest } from '@/lib/integrations/laudus/client';

export async function GET() {
  const isExpectedPreview =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'optimize/laudus-session-budget-20261102';

  if (!isExpectedPreview) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const result = await runLaudusReadOnlySmokeTest();
  return NextResponse.json({
    authenticated: result.authenticated,
    calls: result.calls,
    persisted: result.persisted,
    results: result.results,
  });
}
