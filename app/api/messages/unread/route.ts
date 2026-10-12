export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { CHAT_NO_STORE, profileLabel } from '@/lib/messages/server';

type InboxRow = {
  id: string;
  kind: 'general' | 'direct';
  participant_a: string | null;
  participant_b: string | null;
  last_message: string | null;
  last_message_at: string | null;
  unread_count: number | string;
};

// One inbox is the authoritative source for both the global notification badge
// and the per-conversation badges. This endpoint never acknowledges reads.
export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;

  try {
    const { data, error } = await ctx.supabase.rpc('motil_message_inbox', {
      p_organization_id: ctx.organizationId, p_profile_id: ctx.userId,
    });
    if (error) throw error;

    const rows = ((data || []) as InboxRow[]).filter((row) => Number(row.unread_count) > 0);
    const contacts = [...new Set(rows
      .filter((row) => row.kind === 'direct')
      .map((row) => row.participant_a === ctx.userId ? row.participant_b : row.participant_a)
      .filter((id): id is string => Boolean(id)))];
    const { data: people, error: peopleError } = contacts.length
      ? await ctx.supabase.from('profiles')
        .select('id,full_name,first_name,last_name,email')
        .eq('organization_id', ctx.organizationId).in('id', contacts)
      : { data: [], error: null };
    if (peopleError) throw peopleError;
    const names = new Map((people || []).map((person: {
      id: string; full_name: string | null; first_name: string | null;
      last_name: string | null; email: string | null;
    }) => [person.id, profileLabel(person)]));

    const conversations = rows.map((row) => {
      const contactId = row.participant_a === ctx.userId ? row.participant_b : row.participant_a;
      return {
        id: row.id,
        kind: row.kind,
        name: row.kind === 'general' ? 'General' : (contactId ? names.get(contactId) : null) || 'Usuario',
        unread: Math.max(0, Number(row.unread_count) || 0),
        lastMessage: row.last_message,
        lastMessageAt: row.last_message_at,
      };
    }).sort((a, b) => (b.lastMessageAt || '').localeCompare(a.lastMessageAt || ''));
    return NextResponse.json({
      totalUnread: conversations.reduce((sum, conversation) => sum + conversation.unread, 0),
      unreadConversations: conversations.length,
      conversations: conversations.slice(0, 15),
    }, { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] unread summary failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'No se pudo consultar la bandeja de mensajes' }, {
      status: 503, headers: CHAT_NO_STORE,
    });
  }
}
