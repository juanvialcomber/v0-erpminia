export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { CHAT_NO_STORE, UUID_PATTERN, getAuthorizedChatThread, profileLabel } from '@/lib/messages/server';
import { visibleChatAssetForProfile } from '@/lib/messages/asset-context';

const MAX_CONTEXTS = 20;

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;

  const assetId = request.nextUrl.searchParams.get('assetId');
  const threadId = request.nextUrl.searchParams.get('threadId');
  if (Boolean(assetId) === Boolean(threadId) ||
      (assetId && !UUID_PATTERN.test(assetId)) ||
      (threadId && !UUID_PATTERN.test(threadId))) {
    return NextResponse.json({ error: 'Referencia inválida' }, { status: 400, headers: CHAT_NO_STORE });
  }

  try {
    if (assetId) {
      const asset = await visibleChatAssetForProfile(ctx, assetId, ctx.userId);
      if (!asset) return NextResponse.json({ error: 'Activo no disponible' },
        { status: 404, headers: CHAT_NO_STORE });

      const { data: links, error: linksError } = await ctx.supabase
        .from('motil_message_asset_contexts')
        .select('thread_id,created_at')
        .eq('organization_id', ctx.organizationId)
        .eq('asset_id', asset.id)
        .order('created_at', { ascending: false }).limit(MAX_CONTEXTS);
      if (linksError) throw linksError;

      const ids = (links || []).map((row) => row.thread_id as string);
      if (!ids.length) {
        return NextResponse.json({
          asset: { id: asset.id, code: asset.asset_code, name: asset.name },
          conversations: [],
        }, { headers: CHAT_NO_STORE });
      }
      const { data: threads, error: threadsError } = await ctx.supabase.from('motil_message_threads')
        .select('id,kind,participant_a,participant_b')
        .eq('organization_id', ctx.organizationId)
        .eq('kind', 'direct').in('id', ids);
      if (threadsError) throw threadsError;
      const authorized = (threads || []).filter((thread) =>
        thread.participant_a === ctx.userId || thread.participant_b === ctx.userId);
      const peerIds = [...new Set(authorized.map((thread) =>
        thread.participant_a === ctx.userId ? thread.participant_b : thread.participant_a))];
      const { data: peers, error: peersError } = peerIds.length
        ? await ctx.supabase.from('profiles')
          .select('id,full_name,first_name,last_name,email')
          .eq('organization_id', ctx.organizationId).in('id', peerIds)
        : { data: [], error: null };
      if (peersError) throw peersError;
      const labels = new Map((peers || []).map((person: {
        id: string; full_name: string | null; first_name: string | null;
        last_name: string | null; email: string | null;
      }) => [person.id, profileLabel(person)]));
      const conversations = authorized.map((thread) => {
        const otherId = thread.participant_a === ctx.userId
          ? thread.participant_b : thread.participant_a;
        return {
          threadId: thread.id,
          participantName: labels.get(otherId) || 'Usuario',
          linkedAt: links?.find((row) => row.thread_id === thread.id)?.created_at || null,
        };
      });
      return NextResponse.json({
        asset: { id: asset.id, code: asset.asset_code, name: asset.name },
        conversations,
      }, { headers: CHAT_NO_STORE });
    }

    const thread = await getAuthorizedChatThread(ctx, threadId!);
    if (!thread) return NextResponse.json({ error: 'Conversación no disponible' },
      { status: 404, headers: CHAT_NO_STORE });
    if (thread.kind !== 'direct') {
      return NextResponse.json({ contexts: [] }, { headers: CHAT_NO_STORE });
    }
    const { data: links, error: linksError } = await ctx.supabase
      .from('motil_message_asset_contexts').select('asset_id,created_at')
      .eq('organization_id', ctx.organizationId).eq('thread_id', thread.id)
      .order('created_at', { ascending: false }).limit(MAX_CONTEXTS);
    if (linksError) throw linksError;

    const contexts = (await Promise.all((links || []).map(async (link) => {
      const asset = await visibleChatAssetForProfile(ctx, link.asset_id, ctx.userId);
      if (!asset) return null;
      return {
        id: asset.id, code: asset.asset_code, name: asset.name,
        linkedAt: link.created_at,
      };
    }))).filter((asset): asset is NonNullable<typeof asset> => Boolean(asset));
    return NextResponse.json({ contexts }, { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] asset context lookup failed',
      error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'No se pudieron cargar los vínculos del activo' },
      { status: 503, headers: CHAT_NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  if (Number(request.headers.get('content-length') || '0') > 2048) {
    return NextResponse.json({ error: 'Solicitud demasiado grande' }, { status: 413, headers: CHAT_NO_STORE });
  }
  const body = await request.json().catch(() => null);
  const assetId = body?.assetId;
  const recipientId = body?.recipientId;
  if (!UUID_PATTERN.test(String(assetId || '')) ||
      !UUID_PATTERN.test(String(recipientId || '')) || recipientId === ctx.userId) {
    return NextResponse.json({ error: 'Selecciona un activo y otro usuario' },
      { status: 400, headers: CHAT_NO_STORE });
  }

  try {
    const [asset, recipientAsset] = await Promise.all([
      visibleChatAssetForProfile(ctx, assetId, ctx.userId),
      visibleChatAssetForProfile(ctx, assetId, recipientId),
    ]);
    if (!asset) return NextResponse.json({ error: 'No tienes acceso a este activo' },
      { status: 403, headers: CHAT_NO_STORE });
    if (!recipientAsset) return NextResponse.json({
      error: 'El destinatario no tiene acceso autorizado a este activo',
    }, { status: 403, headers: CHAT_NO_STORE });

    // Reuse the canonical direct channel for the unordered pair of users.
    const [a, b] = ctx.userId < recipientId
      ? [ctx.userId, recipientId] : [recipientId, ctx.userId];
    const threadKey = 'dm:' + a + ':' + b;
    const { error: upsertError } = await ctx.supabase.from('motil_message_threads').upsert({
      organization_id: ctx.organizationId, thread_key: threadKey,
      kind: 'direct', participant_a: a, participant_b: b, created_by: ctx.userId,
    }, { onConflict: 'organization_id,thread_key', ignoreDuplicates: true });
    if (upsertError) throw upsertError;

    const { data: thread, error: threadError } = await ctx.supabase.from('motil_message_threads')
      .select('id').eq('organization_id', ctx.organizationId)
      .eq('thread_key', threadKey).single();
    if (threadError || !thread) throw threadError || new Error('Direct thread not found');

    // Idempotent metadata link. NEVER mutate canonical assets, OT or messages.
    const { error: linkError } = await ctx.supabase.from('motil_message_asset_contexts').upsert({
      organization_id: ctx.organizationId,
      thread_id: thread.id,
      asset_id: asset.id,
      created_by: ctx.userId,
    }, { onConflict: 'organization_id,thread_id,asset_id', ignoreDuplicates: true });
    if (linkError) throw linkError;

    return NextResponse.json({
      threadId: thread.id,
      asset: { id: asset.id, code: asset.asset_code, name: asset.name },
    }, { headers: CHAT_NO_STORE });
  } catch (error) {
    console.error('[messages] asset association failed',
      error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'No se pudo vincular el activo a la conversación' },
      { status: 503, headers: CHAT_NO_STORE });
  }
}
