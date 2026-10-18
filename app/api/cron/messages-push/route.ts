export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
// Explicit handover gate: disabled unless this deployment is the appointed cron executor.
function cronExecutorEnabled() {
  return process.env.MOTIL_CRON_EXECUTOR_ENABLED === 'true';
}

import { dispatchPendingMessagePush } from '@/lib/messages/push-dispatcher';

export async function GET(request: NextRequest) {
  if (!cronExecutorEnabled()) {
    return NextResponse.json({ error: 'Cron executor disabled on this deployment' }, { status: 503 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24) {
    return NextResponse.json({ error: 'Message delivery scheduler is not configured' }, { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await dispatchPendingMessagePush(6);
    if (result.configurationError) {
      return NextResponse.json({ error: 'Push credentials are invalid', code: result.configurationError }, { status: 503 });
    }
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[messages-push] worker failed', error instanceof Error ? error.message : 'worker_error');
    return NextResponse.json({ error: 'Message push processing failed' }, { status: 500 });
  }
}
