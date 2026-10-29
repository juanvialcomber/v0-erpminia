import { AsyncLocalStorage } from 'node:async_hooks';
import { getSupabaseServerClient } from '@/lib/supabase-server';

type UsageState = {
  requests: number;
  logins: number;
  reads: number;
  errors: number;
  endpoints: Record<string, number>;
  firstCalledAt: string | null;
  lastCalledAt: string | null;
};

const usageStorage = new AsyncLocalStorage<UsageState>();

function cleanPath(path: string) {
  return String(path || '').split('?')[0].slice(0, 160) || 'unknown';
}

export function noteLaudusApiRequest(path: string, status: number) {
  const state = usageStorage.getStore();
  if (!state) return;

  const now = new Date().toISOString();
  const endpoint = cleanPath(path);
  state.requests += 1;
  if (endpoint === '/security/login') state.logins += 1;
  else state.reads += 1;
  if (status === 0 || status >= 400) state.errors += 1;
  state.endpoints[endpoint] = (state.endpoints[endpoint] || 0) + 1;
  state.firstCalledAt ||= now;
  state.lastCalledAt = now;
}

export async function withLaudusApiUsageTracking<T>(
  organizationId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const state: UsageState = {
    requests: 0,
    logins: 0,
    reads: 0,
    errors: 0,
    endpoints: {},
    firstCalledAt: null,
    lastCalledAt: null,
  };

  let result: T;
  let operationError: unknown;

  try {
    result = await usageStorage.run(state, operation);
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    if (state.requests > 0) {
      try {
        const supabase = getSupabaseServerClient();
        const { error } = await supabase.rpc('motil_record_laudus_api_usage', {
          p_organization_id: organizationId,
          p_request_count: state.requests,
          p_login_count: state.logins,
          p_read_count: state.reads,
          p_error_count: state.errors,
          p_endpoint_counts: state.endpoints,
          p_first_called_at: state.firstCalledAt,
          p_last_called_at: state.lastCalledAt,
        });
        if (error) {
          console.error('[laudus/api-usage] persistence failed', { organizationId });
        }
      } catch {
        console.error('[laudus/api-usage] persistence unavailable', { organizationId });
      }
    }
  }

  if (operationError) throw operationError;
  return result!;
}
