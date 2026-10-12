export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { sendWebPush, getWebPushConfigError } from '@/lib/notifications/web-push';
import { createPilotReceipt } from '@/lib/notifications/pilot-receipts';

function validEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443') && url.hostname.length < 255 && endpoint.length < 2048;
  } catch { return false; }
}
function validKey(value: unknown, min: number, max: number) {
  return typeof value === 'string' && value.length >= min && value.length <= max && /^[a-zA-Z0-9_-]+$/.test(value);
}
const noStore = { 'Cache-Control': 'no-store' };
const configMessages = {
  missing_config: 'Falta configurar las claves Web Push en Vercel.',
  invalid_public_key: 'La clave pública Web Push no tiene un formato válido.',
  invalid_private_key: 'La clave privada Web Push no tiene un formato válido.',
  key_pair_mismatch: 'Las claves pública y privada Web Push no corresponden al mismo par.',
  invalid_subject: 'El contacto VAPID debe ser una URL HTTPS o una dirección mailto válida.',
} as const;

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const { count, error } = await ctx.supabase.from('user_push_subscriptions')
    .select('id', { count: 'exact', head: true }).eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId).eq('enabled', true);
  if (error) return NextResponse.json({ error: 'No fue posible consultar los dispositivos' }, { status: 500 });
  const pilot = ctx.userEmail?.trim().toLowerCase() === 'juan@n3uralia.com';
  const configError = pilot ? getWebPushConfigError() : null;
  const { data: tests, error: testsError } = pilot
    ? await ctx.supabase.from('user_push_subscriptions')
      .select('last_test_id,last_test_at,last_test_provider_status,last_test_received_at,last_test_displayed_at,last_test_clicked_at,last_test_display_error')
      .eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId)
      .not('last_test_id', 'is', null).order('last_test_at', { ascending: false }).limit(5)
    : { data: [], error: null };
  if (testsError) return NextResponse.json({ error: 'No fue posible consultar la recepción de las pruebas' }, { status: 500 });
  const receipts = (tests || []).map((test) => ({
    testId: test.last_test_id, sentAt: test.last_test_at, providerStatus: test.last_test_provider_status,
    receivedAt: test.last_test_received_at, displayedAt: test.last_test_displayed_at,
    clickedAt: test.last_test_clicked_at, displayError: test.last_test_display_error,
  }));
  return NextResponse.json({ publicKey: process.env.WEB_PUSH_VAPID_PUBLIC_KEY || null, devices: count || 0,
    pilot, receipts,
    ...(configError ? { configurationError: configMessages[configError] } : {}),
  }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const body = await request.json().catch(() => null);
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (typeof endpoint !== 'string' || !validEndpoint(endpoint) || !validKey(p256dh, 80, 140) || !validKey(auth, 20, 100))
    return NextResponse.json({ error: 'Suscripción no válida' }, { status: 400 });
  const { data: existing, error: lookupError } = await ctx.supabase.from('user_push_subscriptions')
    .select('id,organization_id,user_id').eq('endpoint', endpoint).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'No fue posible validar la suscripción' }, { status: 500 });
  if (existing && (existing.user_id !== ctx.userId || existing.organization_id !== ctx.organizationId))
    return NextResponse.json({ error: 'Dispositivo asociado a otra cuenta. Elimina la suscripción anterior antes de continuar.' }, { status: 409 });
  const { error } = existing
    ? await ctx.supabase.from('user_push_subscriptions').update({ p256dh, auth_secret: auth, enabled: true, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId)
    : await ctx.supabase.from('user_push_subscriptions').insert({ organization_id: ctx.organizationId, user_id: ctx.userId, endpoint, p256dh, auth_secret: auth });
  if (error) return NextResponse.json({ error: 'No fue posible activar notificaciones' }, { status: 500 });
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const body = await request.json().catch(() => null);
  if (!validEndpoint(String(body?.endpoint || ''))) return NextResponse.json({ error: 'Dispositivo inválido' }, { status: 400 });
  const { error } = await ctx.supabase.from('user_push_subscriptions').delete()
    .eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId).eq('endpoint', body.endpoint);
  if (error) return NextResponse.json({ error: 'No fue posible eliminar el dispositivo' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function PUT(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  // Pilot: self-test only, never allows sending to another user.
  if (ctx.userEmail?.trim().toLowerCase() !== 'juan@n3uralia.com')
    return NextResponse.json({ error: 'Prueba reservada al usuario piloto' }, { status: 403 });
  const configError = getWebPushConfigError();
  if (configError) return NextResponse.json({ error: configMessages[configError], code: configError }, { status: 503, headers: noStore });
  const body = await request.json().catch(() => null);
  if (typeof body?.endpoint !== 'string' || !validEndpoint(body.endpoint))
    return NextResponse.json({ error: 'Selecciona una suscripción válida del dispositivo actual' }, { status: 400 });
  let subscriptionsQuery = ctx.supabase.from('user_push_subscriptions')
    .select('id,endpoint,p256dh,auth_secret,last_test_at').eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId).eq('enabled', true);
  subscriptionsQuery = subscriptionsQuery.eq('endpoint', body.endpoint);
  const { data: subscriptions, error } = await subscriptionsQuery.limit(5);
  if (error) return NextResponse.json({ error: 'No fue posible cargar dispositivos' }, { status: 500 });
  if (!subscriptions?.length) return NextResponse.json({ error: 'Activa las notificaciones en este dispositivo primero' }, { status: 409 });
  if (subscriptions.some((s) => s.last_test_at && Date.now() - new Date(s.last_test_at).getTime() < 60000))
    return NextResponse.json({ error: 'Espera un minuto antes de repetir la prueba' }, { status: 429 });
  const timestamp = new Date().toISOString();
  // Reserve rate-limit before network send; repeated concurrent calls cannot flood other users.
  const results = [];
  for (const subscription of subscriptions) {
    const receipt = createPilotReceipt();
    let reserveQuery = ctx.supabase.from('user_push_subscriptions')
      .update({ last_test_at: timestamp, last_test_id: receipt.testId,
        last_test_receipt_hash: receipt.tokenHash, last_test_provider_status: null,
        last_test_received_at: null, last_test_displayed_at: null,
        last_test_clicked_at: null, last_test_display_error: null,
      }).eq('id', subscription.id)
      .eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId).eq('enabled', true);
    reserveQuery = subscription.last_test_at ? reserveQuery.eq('last_test_at', subscription.last_test_at) : reserveQuery.is('last_test_at', null);
    const { data: reserved, error: reservationError } = await reserveQuery.select('id').maybeSingle();
    if (reservationError || !reserved) continue;
    try {
      const sent = await sendWebPush({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth_secret } },
        { title: 'MOTIL · Notificación de prueba', body: 'Aviso personal de prueba. Toca para abrir MOTIL.', url: '/dashboard',
          receipt: { testId: receipt.testId, token: receipt.token } });
      if (sent.expired) await ctx.supabase.from('user_push_subscriptions').update({ enabled: false }).eq('id', subscription.id).eq('organization_id', ctx.organizationId);
      const { error: statusError } = await ctx.supabase.from('user_push_subscriptions')
        .update({ last_test_provider_status: sent.status }).eq('id', subscription.id)
        .eq('organization_id', ctx.organizationId).eq('user_id', ctx.userId).eq('last_test_id', receipt.testId);
      results.push({ testId: receipt.testId, status: sent.status, accepted: sent.ok, trackingSaved: !statusError });
    } catch {
      const { error: failureTrackingError } = await ctx.supabase.from('user_push_subscriptions').update({ last_test_provider_status: 0 })
        .eq('id', subscription.id).eq('organization_id', ctx.organizationId)
        .eq('user_id', ctx.userId).eq('last_test_id', receipt.testId);
      results.push({ testId: receipt.testId, status: 0, accepted: false, trackingSaved: !failureTrackingError });
    }
  }
  return NextResponse.json({ attempted: results.length, accepted: results.filter((r) => r.accepted).length, results }, { headers: noStore });
}
