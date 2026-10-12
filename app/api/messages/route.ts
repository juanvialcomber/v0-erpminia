export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse, after } from 'next/server';
import { dispatchPendingMessagePush } from '@/lib/messages/push-dispatcher';
import { getOrganizationContext } from '@/lib/api/organization-context';
import {
  CHAT_NO_STORE, UUID_PATTERN, getAuthorizedChatThread, otherParticipant, profileLabel,
} from '@/lib/messages/server';

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;

  const [inboxResult, peopleResult] = await Promise.all([
    ctx.supabase.rpc('motil_message_inbox', {
      p_organization_id: ctx.organizationId, p_profile_id: ctx.userId,
    }),
    ctx.supabase.from('profiles')
      .select('id,full_name,first_name,last_name,email')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'active')
      .order('full_name', { ascending: true }).limit(300),
  ]);
  if (inboxResult.error || peopleResult.error) {
    console.error('[messages] inbox query failed', inboxResult.error?.code || peopleResult.error?.code);
    return NextResponse.json({ error: 'No fue posible cargar mensajes. Comprueba que la migración esté aplicada.' },
      { status: 503, headers: CHAT_NO_STORE });
  }

  const people = (peopleResult.data || []).map((p) => ({
    id: p.id, name: profileLabel(p),
  }));
  const names = new Map(people.map((p) => [p.id, p.name]));
  type InboxRow = {
    id: string; kind: 'general' | 'direct'; title: string | null;
    participant_a: string | null; participant_b: string | null;
    last_message: string | null; last_message_at: string | null; unread_count: number | string;
  };
  const conversations = ((inboxResult.data || []) as InboxRow[]).map((t) => {
    const contactId = t.kind === 'direct'
      ? (t.participant_a === ctx.userId ? t.participant_b : t.participant_a) : null;
    return {
      id: t.id, kind: t.kind, name: t.kind === 'general' ? 'General' : (names.get(contactId) || 'Usuario no disponible'),
      contactId, lastMessage: t.last_message || null, lastMessageAt: t.last_message_at || null,
      unread: Math.max(0, Number(t.unread_count) || 0),
    };
  });

  return NextResponse.json({
    me: { id: ctx.userId, name: ctx.userName || 'Usuario' },
    conversations, people: people.filter((p) => p.id !== ctx.userId),
    refreshIntervalSeconds: 5,
  }, { headers: CHAT_NO_STORE });
}

export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const claimedLength = Number(request.headers.get('content-length') || 0);
  if (claimedLength > 10000) return NextResponse.json({ error: 'Mensaje demasiado largo' }, { status: 413 });
  const body = await request.json().catch(() => null);
  const threadId = body?.threadId;
  const clientMessageId = body?.clientMessageId;
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!UUID_PATTERN.test(String(threadId || '')) || !UUID_PATTERN.test(String(clientMessageId || '')) ||
      text.length < 1 || text.length > 2000) {
    return NextResponse.json({ error: 'Mensaje inválido (máximo 2000 caracteres)' }, { status: 400 });
  }

  try {
    const thread = await getAuthorizedChatThread(ctx, threadId);
    if (!thread) return NextResponse.json({ error: 'Conversación no disponible' }, { status: 404 });

    const otherId = otherParticipant(thread, ctx.userId);
    if (otherId) {
      const { data: other, error: otherError } = await ctx.supabase.from('profiles')
        .select('id').eq('id', otherId).eq('organization_id', ctx.organizationId)
        .eq('status', 'active').maybeSingle();
      if (otherError) throw otherError;
      if (!other) return NextResponse.json({ error: 'El destinatario ya no está activo' }, { status: 409 });
    }

    const { data, error } = await ctx.supabase.from('motil_message_entries')
      .insert({
        organization_id: ctx.organizationId, thread_id: thread.id,
        sender_id: ctx.userId, client_message_id: clientMessageId, body: text,
      })
      .select('id,created_at,body').single();

    if (error?.code === '23505') {
      const previous = await ctx.supabase.from('motil_message_entries')
        .select('id,created_at,body').eq('organization_id', ctx.organizationId)
        .eq('sender_id', ctx.userId).eq('client_message_id', clientMessageId).maybeSingle();
      if (previous.error || !previous.data) return NextResponse.json({ error: 'No fue posible recuperar el mensaje' }, { status: 500 });
      return NextResponse.json({ ok: true, duplicate: true, message: previous.data }, { headers: CHAT_NO_STORE });
    }
    if (error) throw error;
    if (thread.kind === 'direct') {
      // Send promptly after persisting. The transactional outbox remains for retries.
      after(async () => {
        try { await dispatchPendingMessagePush(2); }
        catch (pushError) {
          console.error('[messages] deferred Push failed', pushError instanceof Error ? pushError.message : 'unknown');
        }
      });
    }
    return NextResponse.json({ ok: true, duplicate: false, message: data }, { status: 201, headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] send failed', error instanceof Error ? error.message : 'db error');
    return NextResponse.json({ error: 'No se pudo enviar. Intenta nuevamente.' }, { status: 500, headers: CHAT_NO_STORE });
  }
}
