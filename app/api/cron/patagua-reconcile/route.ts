export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { greenDb, GREEN_NO_STORE } from '@/lib/messages/greenapi';
import { syncGreenApiGroupHistory } from '@/lib/messages/greenapi-history-sync';

// Twice-daily source reconciliation. Email is deliberately read-only here:
// Gmail catch-up must be connected to an authenticated cursor-based worker.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 || request.headers.get('authorization') !== 'Bearer ' + secret)
    return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: GREEN_NO_STORE });

  const db = greenDb();
  const [email, whatsapp, attachments] = await Promise.all([
    db.from('motil_email_source_manifest').select('email_sent_at,ingest_state,download_state')
      .order('email_sent_at', { ascending: false }).limit(1),
    db.from('motil_whatsapp_messages').select('occurred_at')
      .order('occurred_at', { ascending: false }).limit(1),
    db.from('motil_whatsapp_attachments').select('id', { count: 'exact', head: true })
      .in('download_status', ['unavailable', 'unsupported']),
  ]);
  if (email.error || whatsapp.error || attachments.error) {
    console.error('[patagua-reconcile] source query failed', {
      email: email.error?.code, whatsapp: whatsapp.error?.code, attachments: attachments.error?.code,
    });
    return NextResponse.json({ ok: false, error: 'source_query_failed' },
      { status: 503, headers: GREEN_NO_STORE });
  }

  let recovery: Awaited<ReturnType<typeof syncGreenApiGroupHistory>> | null = null;
  let recoveryError: string | null = null;
  try { recovery = await syncGreenApiGroupHistory(); }
  catch (error) {
    recoveryError = error instanceof Error ? error.message : 'recovery_failed';
  }

  const latestEmail = email.data?.[0]?.email_sent_at || null;
  const latestWhatsapp = whatsapp.data?.[0]?.occurred_at || null;
  const now = Date.now();
  const ageHours = (date: string | null) => date ? Math.round((now - Date.parse(date)) / 360000) / 10 : null;
  const emailLagHours = ageHours(latestEmail);
  const whatsappLagHours = ageHours(latestWhatsapp);
  const staleEmail = emailLagHours === null || emailLagHours > 36;
  const staleWhatsapp = whatsappLagHours === null || whatsappLagHours > 36;
  const ok = !staleEmail && !staleWhatsapp && !recoveryError && recovery?.failures === 0;
  const result = {
    ok, checked_at: new Date(now).toISOString(),
    email: { latest_source_at: latestEmail, lag_hours: emailLagHours,
      status: staleEmail ? 'stale_manifest_requires_gmail_backfill' : 'fresh_manifest' },
    whatsapp: { latest_event_at: latestWhatsapp, lag_hours: whatsappLagHours,
      status: staleWhatsapp ? 'stale' : 'fresh', recovery },
    attachments: { unavailable_or_unsupported: attachments.count ?? null },
    recovery_error: recoveryError,
    note: 'This reconciles source freshness and recovers WhatsApp history; it does not import Gmail or promote canonical operational records.',
  };
  if (!ok) console.error('[patagua-reconcile] degraded', JSON.stringify(result));
  return NextResponse.json(result, { status: ok ? 200 : 503, headers: GREEN_NO_STORE });
}
