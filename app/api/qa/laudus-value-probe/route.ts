export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { runLaudusReadOnlyValueProbe } from '@/lib/integrations/laudus/client';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  try {
    const result = await runLaudusReadOnlyValueProbe();
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const status = error && typeof error === 'object' && 'status' in error
      ? Number((error as { status?: number }).status) || 502
      : 502;

    return NextResponse.json(
      {
        authenticated: false,
        persisted: false,
        redacted: true,
        upstreamStatus: status,
      },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
