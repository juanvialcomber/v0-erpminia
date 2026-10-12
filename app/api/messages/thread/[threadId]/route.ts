export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { CHAT_NO_STORE, UUID_PATTERN, getAuthorizedChatThread, profileLabel } from '@/lib/messages/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const { threadId } = await params;
  if (!UUID_PATTERN.test(threadId)) return NextResponse.json({ error: 'Conversación inválida' }, { status: 400 });

  const cursor = request.nextUrl.searchParams.get('before');
  const before = cursor ? new Date(cursor) : null;
  if (cursor && (!before || Number.isNaN(before.getTime()))) {
    return NextResponse.json({ error: 'Cursor inválido' }, { status: 400 });
  }

  try {
    const thread = await getAuthorizedChatThread(ctx, threadId);
    if (!thread) return NextResponse.json({ error: 'Conversación no disponible' }, { status: 404 });

    let query = ctx.supabase.from('motil_message_entries')
      .select('id,sender_id,body,created_at')
      .eq('organization_id', ctx.organizationId).eq('thread_id', threadId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }).limit(41);
    if (before) query = query.lt('created_at', before.toISOString());
    const { data, error } = await query;
    if (error) throw error;

    const rows = (data || []).slice(0, 40);
    const senderIds = [...new Set(rows.map((r) => r.sender_id))];
    const { data: senders, error: senderError } = senderIds.length
      ? await ctx.supabase.from('profiles').select('id,full_name,first_name,last_name,email')
        .eq('organization_id', ctx.organizationId).in('id', senderIds)
      : { data: [], error: null };
    if (senderError) throw senderError;
    const names = new Map((senders || []).map((p) => [p.id, profileLabel(p)]));
    const messages = rows.reverse().map((row) => ({
      id: row.id, senderId: row.sender_id, senderName: names.get(row.sender_id) || 'Usuario',
      text: row.body, createdAt: row.created_at,
    }));
    return NextResponse.json({ messages, hasMore: (data || []).length > 40 },
      { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] history fetch failed', error instanceof Error ? error.message : 'db error');
    return NextResponse.json({ error: 'No se pudo cargar la conversación' },
      { status: 503, headers: CHAT_NO_STORE });
  }
}
