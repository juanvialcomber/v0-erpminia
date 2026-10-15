export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { greenDb, greenInstance, validWebhookToken, GREEN_NO_STORE } from '@/lib/messages/greenapi';

// Always acknowledge irrelevant notification types to avoid retry storms.
// The webhook is intentionally distinct from MOTIL's internal messaging inbox.
export async function POST(request: NextRequest) {
  const bearerToken = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;
  const headerToken = request.headers.get('x-greenapi-token');
  if (![bearerToken, headerToken].some((token) => validWebhookToken(token))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: GREEN_NO_STORE });
  }
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 65536) return NextResponse.json({ error: 'Payload demasiado grande' }, { status: 413 });
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 65536) return NextResponse.json({ error: 'Payload demasiado grande' }, { status: 413 });
  let payload: Record<string, any>;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }); }
  if (payload.typeWebhook !== 'incomingMessageReceived') return NextResponse.json({ ok: true, skipped: 'type' }, { headers: GREEN_NO_STORE });
  if (String(payload.instanceData?.idInstance || '') !== greenInstance()) return NextResponse.json({ error: 'Instancia no reconocida' }, { status: 403 });
  const chatId = String(payload.senderData?.chatId || '');
  const messageId = String(payload.idMessage || '');
  if (!/^\d{5,30}@g\.us$/.test(chatId) || !messageId || messageId.length > 255) {
    return NextResponse.json({ ok: true, skipped: 'not_selected_group' }, { headers: GREEN_NO_STORE });
  }
  const db = greenDb();
  const { data: group, error: groupError } = await db.from('motil_whatsapp_groups')
    .select('id,organization_id,enabled').eq('instance_id', greenInstance())
    .eq('chat_id', chatId).maybeSingle();
  if (groupError) return NextResponse.json({ error: 'Error de almacenamiento' }, { status: 503 });
  if (!group?.enabled) return NextResponse.json({ ok: true, skipped: 'not_enabled' }, { headers: GREEN_NO_STORE });
  const type = String(payload.messageData?.typeMessage || 'unknown').slice(0, 64);
  const data = payload.messageData || {};
  const text = typeof data.textMessageData?.textMessage === 'string' ? data.textMessageData.textMessage
    : typeof data.extendedTextMessageData?.text === 'string' ? data.extendedTextMessageData.text
    : typeof data.imageMessageData?.caption === 'string' ? data.imageMessageData.caption
    : typeof data.videoMessageData?.caption === 'string' ? data.videoMessageData.caption
    : typeof data.documentMessageData?.caption === 'string' ? data.documentMessageData.caption : null;
  const seconds = Number(payload.timestamp);
  if (!Number.isFinite(seconds) || seconds < 1000000000 || seconds > (Date.now() / 1000 + 3600)) {
    return NextResponse.json({ error: 'Timestamp inválido' }, { status: 400 });
  }
  const { error } = await db.from('motil_whatsapp_messages').upsert({
    organization_id: group.organization_id, group_id: group.id, provider_message_id: messageId,
    sender_chat_id: String(payload.senderData?.sender || '').slice(0,128),
    sender_name: String(payload.senderData?.senderName || '').slice(0,160),
    body: text?.slice(0,10000) || null, message_type: type,
    file_name: String(data.documentMessageData?.fileName || '').slice(0,255) || null,
    quoted_message_id: String(data.extendedTextMessageData?.stanzaId || '').slice(0,255) || null,
    occurred_at: new Date(seconds * 1000).toISOString(),
  }, { onConflict: 'group_id,provider_message_id', ignoreDuplicates: true });
  if (error) {
    console.error('[greenapi] insert failed', error.code);
    return NextResponse.json({ error: 'No se pudo registrar el evento' }, { status: 503 });
  }
  // Fail-closed: no asset, person, OT or HSE record is ever mutated by this intake.
  return NextResponse.json({ ok: true }, { headers: GREEN_NO_STORE });
}
