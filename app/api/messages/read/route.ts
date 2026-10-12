export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { CHAT_NO_STORE, UUID_PATTERN, getAuthorizedChatThread } from '@/lib/messages/server';

export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const body = await request.json().catch(() => null);
  const threadId = body?.threadId;
  const messageId = body?.messageId;
  if (!UUID_PATTERN.test(String(threadId || '')) || !UUID_PATTERN.test(String(messageId || ''))) {
    return NextResponse.json({ error: 'Confirmación inválida' }, { status: 400 });
  }

  try {
    const thread = await getAuthorizedChatThread(ctx, threadId);
    if (!thread) return NextResponse.json({ error: 'Conversación no disponible' }, { status: 404 });

    const { error } = await ctx.supabase.rpc('motil_message_advance_read', {
      p_organization_id: ctx.organizationId,
      p_thread_id: thread.id,
      p_profile_id: ctx.userId,
      p_message_id: messageId,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true }, { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] read acknowledgement failed', error instanceof Error ? error.message : 'db error');
    return NextResponse.json({ error: 'No se pudo registrar la lectura' }, { status: 500 });
  }
}
