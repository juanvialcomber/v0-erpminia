export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { CHAT_NO_STORE, UUID_PATTERN, getAuthorizedChatThread, profileLabel } from '@/lib/messages/server';
import { visibleWorkOrderForProfile } from '@/lib/messages/work-order-context';

const MAX_CONTEXTS = 20;

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const workOrderId = request.nextUrl.searchParams.get('workOrderId');
  const threadId = request.nextUrl.searchParams.get('threadId');
  if (Boolean(workOrderId) === Boolean(threadId) ||
      (workOrderId && !UUID_PATTERN.test(workOrderId)) ||
      (threadId && !UUID_PATTERN.test(threadId))) {
    return NextResponse.json({ error: 'Referencia inválida' }, { status: 400, headers: CHAT_NO_STORE });
  }

  try {
    if (workOrderId) {
      const order = await visibleWorkOrderForProfile(ctx, workOrderId, ctx.userId);
      if (!order) return NextResponse.json({ error: 'OT no disponible' }, { status: 404, headers: CHAT_NO_STORE });

      const { data, error } = await ctx.supabase.from('motil_message_work_order_contexts')
        .select('thread_id,created_at')
        .eq('organization_id', ctx.organizationId).eq('work_order_id', order.id)
        .order('created_at', { ascending: false }).limit(MAX_CONTEXTS);
      if (error) throw error;
      const ids = (data || []).map((row) => row.thread_id as string);
      if (!ids.length) {
        return NextResponse.json({ order: { id: order.id, number: order.work_order_number, title: order.title }, conversations: [] },
          { headers: CHAT_NO_STORE });
      }

      const { data: threads, error: threadError } = await ctx.supabase.from('motil_message_threads')
        .select('id,kind,participant_a,participant_b')
        .eq('organization_id', ctx.organizationId).eq('kind', 'direct').in('id', ids);
      if (threadError) throw threadError;
      const authorized = (threads || []).filter((thread) =>
        thread.participant_a === ctx.userId || thread.participant_b === ctx.userId);
      const otherIds = [...new Set(authorized.map((thread) =>
        thread.participant_a === ctx.userId ? thread.participant_b : thread.participant_a))];
      const { data: people, error: peopleError } = otherIds.length
        ? await ctx.supabase.from('profiles').select('id,full_name,first_name,last_name,email')
          .eq('organization_id', ctx.organizationId).in('id', otherIds)
        : { data: [], error: null };
      if (peopleError) throw peopleError;
      const labels = new Map((people || []).map((person: {
        id: string; full_name: string | null; first_name: string | null;
        last_name: string | null; email: string | null;
      }) => [person.id, profileLabel(person)]));
      const conversations = authorized.map((thread) => {
        const other = thread.participant_a === ctx.userId ? thread.participant_b : thread.participant_a;
        return {
          threadId: thread.id,
          participantName: labels.get(other) || 'Usuario',
          linkedAt: data?.find((row) => row.thread_id === thread.id)?.created_at || null,
        };
      });
      return NextResponse.json({
        order: { id: order.id, number: order.work_order_number, title: order.title }, conversations,
      }, { headers: CHAT_NO_STORE });
    }

    const thread = await getAuthorizedChatThread(ctx, threadId!);
    if (!thread) return NextResponse.json({ error: 'Conversación no disponible' },
      { status: 404, headers: CHAT_NO_STORE });
    if (thread.kind !== 'direct') return NextResponse.json({ contexts: [] }, { headers: CHAT_NO_STORE });

    const { data, error } = await ctx.supabase.from('motil_message_work_order_contexts')
      .select('work_order_id,created_at')
      .eq('organization_id', ctx.organizationId).eq('thread_id', thread.id)
      .order('created_at', { ascending: false }).limit(MAX_CONTEXTS);
    if (error) throw error;
    const contexts = (await Promise.all((data || []).map(async (row) => {
      const order = await visibleWorkOrderForProfile(ctx, row.work_order_id, ctx.userId);
      if (!order) return null;
      return {
        id: order.id, number: order.work_order_number, title: order.title,
        status: order.status, linkedAt: row.created_at,
      };
    }))).filter((order): order is NonNullable<typeof order> => Boolean(order));
    return NextResponse.json({ contexts }, { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] OT context lookup failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'No se pudo cargar el contexto de OT' }, { status: 503, headers: CHAT_NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  if (Number(request.headers.get('content-length') || '0') > 2048) {
    return NextResponse.json({ error: 'Solicitud demasiado grande' }, { status: 413 });
  }
  const body = await request.json().catch(() => null);
  const workOrderId = body?.workOrderId;
  const recipientId = body?.recipientId;
  if (!UUID_PATTERN.test(String(workOrderId || '')) ||
      !UUID_PATTERN.test(String(recipientId || '')) || recipientId === ctx.userId) {
    return NextResponse.json({ error: 'Selecciona una OT y otra persona' }, { status: 400, headers: CHAT_NO_STORE });
  }

  try {
    const [order, recipientOrder] = await Promise.all([
      visibleWorkOrderForProfile(ctx, workOrderId, ctx.userId),
      visibleWorkOrderForProfile(ctx, workOrderId, recipientId),
    ]);
    if (!order) return NextResponse.json({ error: 'No tienes acceso a esta OT' },
      { status: 403, headers: CHAT_NO_STORE });
    if (!recipientOrder) return NextResponse.json({
      error: 'El destinatario no tiene acceso autorizado a esta OT',
    }, { status: 403, headers: CHAT_NO_STORE });

    const [a, b] = ctx.userId < recipientId
      ? [ctx.userId, recipientId] : [recipientId, ctx.userId];
    const threadKey = `dm:${a}:${b}`;
    const { error: createError } = await ctx.supabase.from('motil_message_threads').upsert({
      organization_id: ctx.organizationId, thread_key: threadKey,
      kind: 'direct', participant_a: a, participant_b: b, created_by: ctx.userId,
    }, { onConflict: 'organization_id,thread_key', ignoreDuplicates: true });
    if (createError) throw createError;
    const { data: thread, error: lookupError } = await ctx.supabase.from('motil_message_threads')
      .select('id').eq('organization_id', ctx.organizationId)
      .eq('thread_key', threadKey).single();
    if (lookupError || !thread) throw lookupError || new Error('Direct thread unavailable');

    // Idempotent link: same direct conversation and OT produces ONE association.
    // It creates NO synthetic message and never changes the work order.
    const { error: linkError } = await ctx.supabase.from('motil_message_work_order_contexts').upsert({
      organization_id: ctx.organizationId,
      thread_id: thread.id,
      work_order_id: order.id,
      created_by: ctx.userId,
    }, { onConflict: 'organization_id,thread_id,work_order_id', ignoreDuplicates: true });
    if (linkError) throw linkError;

    return NextResponse.json({
      threadId: thread.id,
      workOrder: { id: order.id, number: order.work_order_number, title: order.title },
    }, { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] OT conversation link failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'No se pudo vincular esta OT a la conversación' },
      { status: 503, headers: CHAT_NO_STORE });
  }
}
