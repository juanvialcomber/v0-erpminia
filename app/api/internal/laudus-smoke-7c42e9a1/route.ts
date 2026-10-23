export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { runLaudusReadOnlySmokeTest } from '@/lib/integrations/laudus/client';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const result = await runLaudusReadOnlySmokeTest();
    return NextResponse.json({
      status: 'ok',
      authenticated: result.authenticated,
      calls: result.calls,
      persisted: false,
      results: result.results,
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
