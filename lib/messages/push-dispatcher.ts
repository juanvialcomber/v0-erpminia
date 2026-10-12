import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getWebPushConfigError, sendWebPush } from '@/lib/notifications/web-push';

type PushJob = {
  id: number;
  organization_id: string;
  message_id: string;
  recipient_id: string;
  attempts: number;
};
type DeliveryResult = {
  claimed: number;
  accepted: number;
  retry: number;
  skipped: number;
  failed: number;
  configurationError?: string;
};

/**
 * At-least-once job delivery. The message + outbox item were committed in the
 * same transaction; a lease and bounded retries recover worker crashes.
 * "accepted" means a Push gateway accepted it, never that a phone displayed it.
 */
export async function dispatchPendingMessagePush(batchSize = 6): Promise<DeliveryResult> {
  const configError = getWebPushConfigError();
  if (configError) {
    return { claimed: 0, accepted: 0, retry: 0, skipped: 0, failed: 0, configurationError: configError };
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db.rpc('motil_message_claim_push', {
    batch_size: Math.max(1, Math.min(8, batchSize)),
  });
  if (error) throw new Error('Could not claim message push jobs: ' + error.code);
  const jobs = (data || []) as PushJob[];
  const totals: DeliveryResult = { claimed: jobs.length, accepted: 0, retry: 0, skipped: 0, failed: 0 };

  const processJob = async (job: PushJob) => {
    let status: 'accepted' | 'retry' | 'skipped' | 'failed' = 'retry';
    let acceptedDevices = 0;
    let diagnostic: string | null = null;

    try {
      const [{ data: message, error: messageError }, { data: profile, error: profileError }] = await Promise.all([
        db.from('motil_message_entries').select('id,thread_id,organization_id').eq('id', job.message_id)
          .eq('organization_id', job.organization_id).maybeSingle(),
        db.from('profiles').select('id').eq('id', job.recipient_id)
          .eq('organization_id', job.organization_id).eq('status', 'active').maybeSingle(),
      ]);
      if (messageError || profileError) throw new Error('lookup_failed');
      if (!message || !profile) {
        status = 'skipped';
      } else {
        const { data: subscriptions, error: subscriptionError } = await db.from('user_push_subscriptions')
          .select('id,endpoint,p256dh,auth_secret')
          .eq('organization_id', job.organization_id)
          .eq('user_id', job.recipient_id).eq('enabled', true).limit(8);
        if (subscriptionError) throw new Error('subscriptions_unavailable');

        if (!subscriptions?.length) {
          status = 'skipped';
          diagnostic = 'no_active_push_device';
        } else {
          const results = await Promise.allSettled(subscriptions.map(async (sub) => {
            const sent = await sendWebPush(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_secret } },
              {
                title: 'MOTIL · Mensaje nuevo',
                body: 'Tienes un mensaje privado en MOTIL.',
                url: `/dashboard/mensajes?thread=${message.thread_id}`,
                tag: `motil-msg-${job.message_id}`,
              },
            );
            if (sent.expired) {
              await db.from('user_push_subscriptions')
                .update({ enabled: false }).eq('id', sub.id)
                .eq('organization_id', job.organization_id).eq('user_id', job.recipient_id);
            }
            return sent;
          }));
          acceptedDevices = results.filter((r) => r.status === 'fulfilled' && r.value.ok).length;
          const allExpired = results.length > 0 && results.every(
            (result) => result.status === 'fulfilled' && result.value.expired,
          );
          status = acceptedDevices > 0
            ? 'accepted'
            : allExpired ? 'skipped' : (job.attempts >= 5 ? 'failed' : 'retry');
          if (!acceptedDevices) {
            diagnostic = results.map((r) => r.status === 'fulfilled' ? String(r.value.status) : 'network')
              .slice(0, 8).join(',');
          }
        }
      }
    } catch (error) {
      status = job.attempts >= 5 ? 'failed' : 'retry';
      diagnostic = error instanceof Error ? error.message.slice(0, 100) : 'delivery_error';
    }

    const retrySeconds = Math.min(60 * 2 ** Math.max(0, job.attempts - 1), 3600);
    const { data: saved, error: updateError } = await db.rpc('motil_message_finish_push', {
      p_job_id: job.id,
      p_organization_id: job.organization_id,
      p_attempt: job.attempts,
      p_state: status,
      p_accepted_devices: acceptedDevices,
      p_error_code: diagnostic,
      p_retry_at: new Date(Date.now() + retrySeconds * 1000).toISOString(),
    });
    if (updateError) throw new Error('Could not persist message Push outcome: ' + updateError.code);
    if (saved === true) totals[status] += 1;
  };

  // Limit external HTTP concurrency to bound runtime and gateway load.
  for (let start = 0; start < jobs.length; start += 3) {
    await Promise.all(jobs.slice(start, start + 3).map(processJob));
  }
  return totals;
}
