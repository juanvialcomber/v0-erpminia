import { NextRequest, NextResponse } from 'next/server';
import { GREEN_NO_STORE, greenRequest, validWebhookToken } from '@/lib/messages/greenapi';
import { isGreenApiGroupId } from '@/lib/messages/greenapi-group-discovery.mjs';

export const dynamic = 'force-dynamic';

function configuredGroupId() {
  return String(process.env.N3URALIA_ACCOUNTING_WHATSAPP_GROUP_ID || '').trim();
}

export async function POST(request: NextRequest) {
  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
  const headerToken = request.headers.get('x-greenapi-token');

  if (![bearerToken, headerToken].some((token) => validWebhookToken(token))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: GREEN_NO_STORE });
  }

  const body = await request.json().catch(() => null);
  const chatId = String(body?.chatId || '');
  const message = String(body?.message || '').trim();
  const expected = configuredGroupId();

  if (!expected || !isGreenApiGroupId(expected)) {
    return NextResponse.json({ error: 'accounting_group_not_configured' }, { status: 503, headers: GREEN_NO_STORE });
  }
  if (chatId !== expected) {
    return NextResponse.json({ error: 'group_not_allowed' }, { status: 403, headers: GREEN_NO_STORE });
  }
  if (!message || message.length > 4000) {
    return NextResponse.json({ error: 'invalid_message' }, { status: 400, headers: GREEN_NO_STORE });
  }

  try {
    const result = await greenRequest('sendMessage', { chatId, message });
    return NextResponse.json({
      ok: true,
      idMessage: typeof result?.idMessage === 'string' ? result.idMessage : null,
    }, { headers: GREEN_NO_STORE });
  } catch (error) {
    console.error('[n3uralia-accounting-send] provider failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'provider_send_failed' }, { status: 502, headers: GREEN_NO_STORE });
  }
}
