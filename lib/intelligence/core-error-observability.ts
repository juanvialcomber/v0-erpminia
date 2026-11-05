type DbClient = any;

type CoreErrorRoute = {
  intent?: string | null;
  mode?: string | null;
  capabilities?: string[] | null;
};

type RecordCoreErrorInput = {
  db: DbClient;
  organizationId: string;
  userId: string;
  conversationId?: string | null;
  domain?: string | null;
  route?: CoreErrorRoute | null;
  phase: string;
  error: unknown;
  httpStatus?: number | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'unknown');
}

export function classifyCoreRuntimeError(error: unknown) {
  const detail = errorMessage(error);
  if (/OPENAI_API_KEY/i.test(detail)) return 'ai_configuration_missing';
  if (/no credits remaining|insufficient_quota|quota.*exceeded|billing/i.test(detail)) return 'ai_quota_exhausted';
  if (/invalid model|model.*not.*found|does not exist|not permitted|not available/i.test(detail)) return 'ai_model_unavailable';
  if (/OpenAI respondi[oó]|responses api|upstream|fetch failed|ECONN|ETIMEDOUT/i.test(detail)) return 'ai_upstream_failure';
  if (/PGRST|schema cache|relation .* does not exist|column .* does not exist/i.test(detail)) return 'canonical_source_contract_failure';
  if (/motil_ai_|conversation|message/i.test(detail)) return 'core_persistence_failure';
  return 'core_request_failure';
}

function boundedCapabilities(route?: CoreErrorRoute | null) {
  if (!Array.isArray(route?.capabilities)) return [];
  return route.capabilities
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .slice(0, 16);
}

export async function recordCoreRuntimeError(input: RecordCoreErrorInput) {
  const payload = {
    organization_id: input.organizationId,
    user_id: input.userId,
    conversation_id: input.conversationId || null,
    domain: String(input.domain || 'executive').slice(0, 40),
    route_intent: input.route?.intent ? String(input.route.intent).slice(0, 80) : null,
    route_mode: input.route?.mode ? String(input.route.mode).slice(0, 40) : null,
    route_capabilities: boundedCapabilities(input.route),
    failure_phase: String(input.phase || 'request').slice(0, 80),
    error_code: classifyCoreRuntimeError(input.error),
    http_status: Number.isInteger(input.httpStatus) ? input.httpStatus : null,
  };

  try {
    const result = await input.db.from('motil_ai_core_errors').insert(payload);
    if (result.error) {
      console.warn('[motil-intelligence-core] error observability insert skipped', {
        code: result.error.code || null,
        phase: payload.failure_phase,
      });
      return { persisted: false, errorCode: payload.error_code };
    }
    return { persisted: true, errorCode: payload.error_code };
  } catch {
    return { persisted: false, errorCode: payload.error_code };
  }
}

export const CORE_ERROR_OBSERVABILITY_POLICY = {
  storesPrompt: false,
  storesResponse: false,
  storesRawErrorMessage: false,
  storesSecrets: false,
  authority: 'diagnostic_observability_only',
  operationalMutationExecuted: false,
} as const;
