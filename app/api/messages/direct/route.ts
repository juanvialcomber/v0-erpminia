export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { CHAT_NO_STORE, UUID_PATTERN } from '@/lib/messages/server';

// A DM has one canonical key per organization + unordered pair, so concurrent
// "start conversation" clicks cannot generate duplicate threads.
export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const body = await request.json().catch(() => null);
  const targetId = body?.recipientId;
  if (!UUID_PATTERN.test(String(targetId || '')) || targetId === ctx.userId) {
    return NextResponse.json({ error: 'Selecciona otro usuario' }, { status: 400 });
  }

  try {
    const { data: target, error: targetError } = await ctx.supabase.from('profiles')
      .select('id').eq('id', targetId).eq('organization_id', ctx.organizationId)
      .eq('status', 'active').maybeSingle();
    if (targetError) throw targetError;
    if (!target) return NextResponse.json({ error: 'Usuario no disponible en tu organización' }, { status: 404 });

    const [a, b] = ctx.userId < targetId
      ? [ctx.userId, targetId] : [targetId, ctx.userId];
    const threadKey = `dm:${a}:${b}`;

    const { error: upsertError } = await ctx.supabase.from('motil_message_threads').upsert({
      organization_id: ctx.organizationId, thread_key: threadKey,
      kind: 'direct', participant_a: a, participant_b: b, created_by: ctx.userId,
    }, { onConflict: 'organization_id,thread_key', ignoreDuplicates: true });
    if (upsertError) throw upsertError;

    const { data: thread, error: lookupError } = await ctx.supabase.from('motil_message_threads')
      .select('id').eq('organization_id', ctx.organizationId)
      .eq('thread_key', threadKey).single();
    if (lookupError || !thread) throw lookupError || new Error('Thread missing');
    return NextResponse.json({ id: thread.id }, { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] direct thread creation failed', error instanceof Error ? error.message : 'db error');
    return NextResponse.json({ error: 'No se pudo abrir la conversación' }, { status: 500 });
  }
}
