import { NextResponse } from 'next/server';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'PREVIEW_ONLY' }, { status: 404 });
  }
  const url = process.env.N3_MODEL_ROUTER_URL?.trim();
  const token = process.env.N3_MODEL_ROUTER_MOTIL_TOKEN?.trim();
  const oidc = process.env.VERCEL_OIDC_TOKEN?.trim();
  const bypass = process.env.N3_MODEL_ROUTER_BYPASS_SECRET?.trim();
  if (!url || !token || (!oidc && !bypass)) {
    return NextResponse.json({
      ok: false,
      routerUrl: Boolean(url),
      serviceToken: Boolean(token),
      oidcToken: Boolean(oidc),
      bypassSecret: Boolean(bypass),
      error: 'PREVIEW_ROUTER_CONFIG_INCOMPLETE',
    }, { status: 503 });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-n3-service-token': token,
      ...(oidc ? { 'x-vercel-trusted-oidc-idp-token': oidc } : {}),
      ...(bypass ? { 'x-vercel-protection-bypass': bypass } : {}),
    },
    body: JSON.stringify({
      task_class: 'motil-executive-assistant',
      capability: 'long-context',
      system: 'Responde exactamente con: FALLBACK_OK',
      input: 'Prueba sintética de conectividad. No contiene datos operacionales.',
    }),
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({}));
  return NextResponse.json({
    ok: response.ok && typeof payload?.text === 'string' && payload.text.includes('FALLBACK_OK'),
    status: response.status,
    provider: payload?.provider || null,
    model: payload?.model || null,
    error: payload?.error || null,
  }, { status: response.ok ? 200 : 502 });
}
