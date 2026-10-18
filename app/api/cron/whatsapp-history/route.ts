export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
// Explicit handover gate: disabled unless this deployment is the appointed cron executor.
function cronExecutorEnabled() {
  return process.env.MOTIL_CRON_EXECUTOR_ENABLED === 'true';
}

import { syncGreenApiGroupHistory } from '@/lib/messages/greenapi-history-sync';
import { GREEN_NO_STORE } from '@/lib/messages/greenapi';

// Vercel invokes this on Production only. Never sends WhatsApp messages.
export async function GET(request: NextRequest) {
  if (!cronExecutorEnabled()) {
    return NextResponse.json({ error: 'Cron executor disabled on this deployment' }, { status: 503 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 ||
      request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: GREEN_NO_STORE });
  }
  try {
    const result = await syncGreenApiGroupHistory();
    return NextResponse.json({ ok: result.failures === 0, ...result },
      { status: result.failures > 0 ? 502 : 200, headers: GREEN_NO_STORE });
  } catch (error) {
    const code = error instanceof Error && [
      'greenapi_not_configured', 'group_lookup_failed', 'group_budget_exceeded',
    ].includes(error.message) ? error.message : 'recovery_unavailable';
    console.error('[greenapi-history] recovery failed', code);
    return NextResponse.json({ ok: false, error: code },
      { status: 503, headers: GREEN_NO_STORE });
  }
}
