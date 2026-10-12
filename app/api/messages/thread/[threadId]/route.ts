export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { CHAT_NO_STORE, UUID_PATTERN, getAuthorizedChatThread, otherParticipant, profileLabel } from '@/lib/messages/server';

type StoredMessage = { id: string; sender_id: string; body: string; created_at: string };
type StoredRead = { profile_id: string; last_read_at: string };
type Member = { id: string; created_at: string };
type Delivery = { message_id: string; status: string };

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
    const rows = ((data || []) as StoredMessage[]).slice(0, 40);
    const senderIds = [...new Set(rows.map((row) => row.sender_id))];

    const { data: senders, error: senderError } = senderIds.length
      ? await ctx.supabase.from('profiles').select('id,full_name,first_name,last_name,email')
        .eq('organization_id', ctx.organizationId).in('id', senderIds)
      : { data: [], error: null };
    if (senderError) throw senderError;
    const names = new Map((senders || []).map((person: {
      id: string; full_name: string | null; first_name: string | null;
      last_name: string | null; email: string | null;
    }) => [person.id, profileLabel(person)]));

    const peerId = otherParticipant(thread, ctx.userId);
    const ownIds = rows.filter((row) => row.sender_id === ctx.userId).map((row) => row.id);

    const [readResult, pushResult, memberResult] = await Promise.all([
      ctx.supabase.from('motil_message_reads')
        .select('profile_id,last_read_at')
        .eq('organization_id', ctx.organizationId).eq('thread_id', thread.id),
      peerId && ownIds.length
        ? ctx.supabase.from('motil_message_push_outbox')
          .select('message_id,status')
          .eq('organization_id', ctx.organizationId).eq('recipient_id', peerId).in('message_id', ownIds)
        : Promise.resolve({ data: [] as Delivery[], error: null }),
      thread.kind === 'general' && ownIds.length
        ? ctx.supabase.from('profiles')
          .select('id,created_at')
          .eq('organization_id', ctx.organizationId).eq('status', 'active').limit(2000)
        : Promise.resolve({ data: [] as Member[], error: null }),
    ]);
    if (readResult.error || pushResult.error || memberResult.error) {
      throw readResult.error || pushResult.error || memberResult.error;
    }
    const receipts = (readResult.data || []) as StoredRead[];
    const readBy = new Map(receipts.map((read) => [read.profile_id, new Date(read.last_read_at).getTime()]));
    const pushBy = new Map(((pushResult.data || []) as Delivery[]).map((job) => [job.message_id, job.status]));
    const members = (memberResult.data || []) as Member[];

    const messages = rows.reverse().map((row) => {
      const own = row.sender_id === ctx.userId;
      const messageAt = new Date(row.created_at).getTime();
      const eligible = thread.kind === 'general' && own
        ? members.filter((member) => member.id !== ctx.userId &&
            new Date(member.created_at).getTime() <= messageAt) : [];
      return {
        id: row.id, senderId: row.sender_id, senderName: names.get(row.sender_id) || 'Usuario',
        text: row.body, createdAt: row.created_at,
        readByRecipient: own && Boolean(peerId) && (readBy.get(peerId || '') || 0) >= messageAt,
        recipientCount: thread.kind === 'general' && own ? eligible.length : null,
        readCount: thread.kind === 'general' && own
          ? eligible.filter((member) => (readBy.get(member.id) || 0) >= messageAt).length : null,
        pushStatus: own ? pushBy.get(row.id) || null : null,
      };
    });
    return NextResponse.json({ messages, hasMore: (data || []).length > 40 },
      { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] history fetch failed', error instanceof Error ? error.message : 'db error');
    return NextResponse.json({ error: 'No se pudo cargar la conversación' },
      { status: 503, headers: CHAT_NO_STORE });
  }
}
