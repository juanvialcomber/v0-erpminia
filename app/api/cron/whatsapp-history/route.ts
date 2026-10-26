export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { syncGreenApiGroupHistory } from '@/lib/messages/greenapi-history-sync';
import { GREEN_NO_STORE } from '@/lib/messages/greenapi';

// Vercel invokes this on Production only. Never sends WhatsApp messages.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 ||
      request.headers.get('authorization') !== 'Bearer ' + secret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: GREEN_NO_STORE });
  }
  try {
    const result = await syncGreenApiGroupHistory();
    // Successful invocations used to leave no execution evidence in runtime
    // logs. Log bounded counters only: no chat IDs, text, filenames or secrets.
    console.info('[greenapi-history] completed', {
      groups: result.groups, failures: result.failures, inserted: result.inserted,
      fetched: result.results.reduce((sum, group) => sum + group.fetched, 0),
      eligible: result.results.reduce((sum, group) => sum + group.eligible, 0),
      truncated_groups: result.truncated_groups,
    });
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
