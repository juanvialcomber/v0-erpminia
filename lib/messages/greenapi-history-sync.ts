import { historyMessage } from './greenapi-history';
import { greenConfigured, greenDb, greenInstance, greenRequest } from './greenapi';

// The webhook is the fast path; this bounded recovery pass is deliberately passive.
// Green API's history is best-effort, not a guarantee of complete WhatsApp archives.
const MAX_GROUPS_PER_RUN = 4;
const HISTORY_LIMIT = 100;

type SyncResult = {
  group_id: string;
  status: 'ok' | 'disabled' | 'error';
  fetched: number;
  eligible: number;
  inserted: number;
  truncated: boolean;
  error_code?: string;
};

export async function syncGreenApiGroupHistory() {
  if (!greenConfigured()) throw new Error('greenapi_not_configured');
  const db = greenDb();
  const instanceId = greenInstance();

  // Fetch an extra group rather than silently ignoring groups beyond the budget.
  const { data: groups, error: groupError } = await db.from('motil_whatsapp_groups')
    .select('id,organization_id,chat_id')
    .eq('instance_id', instanceId)
    .eq('enabled', true)
    .order('id')
    .limit(MAX_GROUPS_PER_RUN + 1);
  if (groupError) throw new Error('group_lookup_failed');
  if ((groups?.length || 0) > MAX_GROUPS_PER_RUN) throw new Error('group_budget_exceeded');

  const results: SyncResult[] = [];
  // Green API limits getChatHistory to 1 request/second per instance.
  // The webhook remains the fast path; never hammer history endpoints.
  let requested = 0;
  for (const group of groups || []) {
    try {
      if (requested++ > 0) await new Promise<void>(resolve => setTimeout(resolve, 1350));
      let history: unknown;
      try {
        history = await greenRequest('getChatHistory', {
          chatId: group.chat_id, count: HISTORY_LIMIT,
        });
      } catch (error) {
        if (!(error instanceof Error) || error.message !== 'Proveedor HTTP 429') throw error;
        // One bounded backoff; do not retry auth, validation, or provider 5xx blindly.
        await new Promise<void>(resolve => setTimeout(resolve, 2200));
        history = await greenRequest('getChatHistory', {
          chatId: group.chat_id, count: HISTORY_LIMIT,
        });
      }
      if (!Array.isArray(history)) throw new Error('invalid_history_response');
      const rows = history.slice(0, HISTORY_LIMIT)
        .map((entry: unknown) => historyMessage(entry, group))
        .filter((row): row is NonNullable<typeof row> => row !== null);
      // Provider message ID is the exact identity. Ignore outgoing and other chats.
      const unique = [...new Map(rows.map(row => [row.provider_message_id, row] as const)).values()];

      // A group might have been disabled while fetching the external provider.
      const { data: stillEnabled, error: checkError } = await db.from('motil_whatsapp_groups')
        .select('id').eq('id', group.id).eq('organization_id', group.organization_id)
        .eq('instance_id', instanceId).eq('enabled', true).maybeSingle();
      if (checkError) throw new Error('group_recheck_failed');
      if (!stillEnabled) {
        results.push({ group_id: group.id, status: 'disabled', fetched: history.length,
          eligible: 0, inserted: 0, truncated: history.length >= HISTORY_LIMIT });
        continue;
      }

      let inserted = 0;
      if (unique.length) {
        const { data: saved, error: saveError } = await db.from('motil_whatsapp_messages')
          .upsert(unique, {
            onConflict: 'group_id,provider_message_id', ignoreDuplicates: true,
          }).select('id');
        if (saveError) throw new Error('history_write_failed');
        inserted = saved?.length || 0;
      }
      if (inserted > 0) {
        // This measures successful ingestion, not the original message timestamp.
        const { error: heartbeatError } = await db.from('motil_whatsapp_groups')
          .update({ last_received_at: new Date().toISOString() })
          .eq('id', group.id).eq('organization_id', group.organization_id);
        if (heartbeatError) console.error('[greenapi-history] heartbeat update failed', heartbeatError.code);
      }
      results.push({ group_id: group.id, status: 'ok', fetched: history.length,
        eligible: unique.length, inserted, truncated: history.length >= HISTORY_LIMIT });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const errorCode = /^Proveedor HTTP \d{3}$/.test(message)
        ? message.replace('Proveedor HTTP ', 'provider_http_')
        : ['invalid_history_response', 'group_recheck_failed', 'history_write_failed'].includes(message)
          ? message : 'provider_unavailable';
      console.error('[greenapi-history] group sync failed', { group_id: group.id, error_code: errorCode });
      results.push({ group_id: group.id, status: 'error', fetched: 0, eligible: 0,
        inserted: 0, truncated: false, error_code: errorCode });
    }
  }
  return {
    groups: results.length,
    failures: results.filter(result => result.status === 'error').length,
    inserted: results.reduce((sum, result) => sum + result.inserted, 0),
    truncated_groups: results.filter(result => result.truncated).length,
    results,
  };
}
