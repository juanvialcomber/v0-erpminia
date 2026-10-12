export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { CHAT_NO_STORE, profileLabel } from '@/lib/messages/server';

type SearchableThread = {
  id: string;
  kind: 'general' | 'direct';
  participant_a: string | null;
  participant_b: string | null;
};
type StoredMatch = {
  id: string; thread_id: string; sender_id: string; body: string; created_at: string;
};

// Organization-scoped search. This uses the server-authenticated actor and
// participant predicate BEFORE querying message bodies. Browser-provided tenant
// IDs or user IDs are never accepted.
export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;

  const raw = request.nextUrl.searchParams.get('q') || '';
  const query = raw.trim().slice(0, 80).replace(/[%_\\]/g, '').replace(/\s+/g, ' ').trim();
  if (query.length < 2) {
    return NextResponse.json({ results: [] }, { headers: CHAT_NO_STORE });
  }

  try {
    const { data: threadData, error: threadError } = await ctx.supabase
      .from('motil_message_threads')
      .select('id,kind,participant_a,participant_b')
      .eq('organization_id', ctx.organizationId)
      .or(`kind.eq.general,participant_a.eq.${ctx.userId},participant_b.eq.${ctx.userId}`)
      .limit(2000);
    if (threadError) throw threadError;

    const threads = (threadData || []) as SearchableThread[];
    if (!threads.length) return NextResponse.json({ results: [] }, { headers: CHAT_NO_STORE });
    const { data: matchData, error: matchError } = await ctx.supabase
      .from('motil_message_entries')
      .select('id,thread_id,sender_id,body,created_at')
      .eq('organization_id', ctx.organizationId)
      .in('thread_id', threads.map((thread) => thread.id))
      .ilike('body', '%' + query + '%')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(25);
    if (matchError) throw matchError;
    const matches = (matchData || []) as StoredMatch[];
    if (!matches.length) return NextResponse.json({ results: [] }, { headers: CHAT_NO_STORE });

    const byThread = new Map(threads.map((thread) => [thread.id, thread]));
    const peopleIds = [...new Set(matches.flatMap((row) => {
      const thread = byThread.get(row.thread_id);
      const other = thread?.kind === 'direct'
        ? (thread.participant_a === ctx.userId ? thread.participant_b : thread.participant_a)
        : null;
      return [row.sender_id, other].filter((id): id is string => Boolean(id));
    }))];
    const { data: people, error: peopleError } = await ctx.supabase
      .from('profiles')
      .select('id,full_name,first_name,last_name,email')
      .eq('organization_id', ctx.organizationId)
      .in('id', peopleIds);
    if (peopleError) throw peopleError;
    const names = new Map((people || []).map((person: {
      id: string; full_name: string | null; first_name: string | null;
      last_name: string | null; email: string | null;
    }) => [person.id, profileLabel(person)]));

    const results = matches.flatMap((row) => {
      const thread = byThread.get(row.thread_id);
      if (!thread) return [];
      const other = thread.kind === 'direct'
        ? (thread.participant_a === ctx.userId ? thread.participant_b : thread.participant_a)
        : null;
      return [{
        id: row.id,
        threadId: row.thread_id,
        threadName: thread.kind === 'general' ? 'General'
          : (other ? names.get(other) : null) || 'Usuario',
        senderName: names.get(row.sender_id) || 'Usuario',
        kind: thread.kind,
        text: row.body,
        createdAt: row.created_at,
      }];
    });
    return NextResponse.json({ results }, { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] history search failed', error instanceof Error ? error.message : 'db error');
    return NextResponse.json({ error: 'No se pudo buscar en el historial' },
      { status: 503, headers: CHAT_NO_STORE });
  }
}
