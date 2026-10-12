import type { OrganizationSuccessContext } from '@/lib/api/organization-context';

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const CHAT_NO_STORE = { 'Cache-Control': 'no-store' };

export type ChatThread = {
  id: string;
  organization_id: string;
  kind: 'general' | 'direct';
  title: string | null;
  participant_a: string | null;
  participant_b: string | null;
};

export function profileLabel(profile: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
}) {
  return (
    String(profile.full_name || '').trim() ||
    [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() ||
    String(profile.email || '').trim() ||
    'Usuario'
  );
}

// Important: ctx.supabase uses the server service-role key. Every operation
// therefore needs its own tenant + user authorization check.
export async function getAuthorizedChatThread(
  ctx: OrganizationSuccessContext,
  threadId: string,
): Promise<ChatThread | null> {
  if (!UUID_PATTERN.test(threadId)) return null;
  const { data, error } = await ctx.supabase
    .from('motil_message_threads')
    .select('id,organization_id,kind,title,participant_a,participant_b')
    .eq('id', threadId)
    .eq('organization_id', ctx.organizationId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  if (data.kind === 'general') return data as ChatThread;
  if (data.kind !== 'direct') return null;
  if (data.participant_a !== ctx.userId && data.participant_b !== ctx.userId) return null;
  return data as ChatThread;
}

export function otherParticipant(thread: ChatThread, userId: string) {
  if (thread.kind !== 'direct') return null;
  return thread.participant_a === userId ? thread.participant_b : thread.participant_a;
}
