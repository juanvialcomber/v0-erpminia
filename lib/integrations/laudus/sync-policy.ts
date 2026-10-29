import { type LaudusEntityType } from './model';

export type SyncPriority = 'master' | 'transactional' | 'financial_heavy';

export type EntitySyncPolicy = {
  priority: SyncPriority;
  pageSize: number;
  maxPagesPerRun: number;
  overlapMinutes: number;
  fullSnapshotHours: number | null;
};

export const LAUDUS_SYNC_POLICIES: Record<LaudusEntityType, EntitySyncPolicy> = {
  product: { priority: 'master', pageSize: 100, maxPagesPerRun: 20, overlapMinutes: 15, fullSnapshotHours: 24 },
  supplier: { priority: 'master', pageSize: 100, maxPagesPerRun: 20, overlapMinutes: 15, fullSnapshotHours: 24 },
  warehouse: { priority: 'master', pageSize: 100, maxPagesPerRun: 10, overlapMinutes: 15, fullSnapshotHours: 24 },
  stock: { priority: 'transactional', pageSize: 100, maxPagesPerRun: 20, overlapMinutes: 30, fullSnapshotHours: 6 },
  cost_center: { priority: 'master', pageSize: 100, maxPagesPerRun: 10, overlapMinutes: 15, fullSnapshotHours: 24 },
  purchase_order: { priority: 'transactional', pageSize: 100, maxPagesPerRun: 20, overlapMinutes: 60, fullSnapshotHours: 12 },
  purchase_order_line: { priority: 'transactional', pageSize: 100, maxPagesPerRun: 20, overlapMinutes: 60, fullSnapshotHours: 12 },
  supplier_invoice: { priority: 'transactional', pageSize: 100, maxPagesPerRun: 20, overlapMinutes: 60, fullSnapshotHours: 12 },
  supplier_invoice_line: { priority: 'transactional', pageSize: 100, maxPagesPerRun: 20, overlapMinutes: 60, fullSnapshotHours: 12 },
  accounts_payable: { priority: 'financial_heavy', pageSize: 100, maxPagesPerRun: 10, overlapMinutes: 120, fullSnapshotHours: 12 },
  payment: { priority: 'financial_heavy', pageSize: 100, maxPagesPerRun: 10, overlapMinutes: 120, fullSnapshotHours: 12 },
  credit_note: { priority: 'financial_heavy', pageSize: 100, maxPagesPerRun: 10, overlapMinutes: 120, fullSnapshotHours: 12 },
  fixed_asset: { priority: 'financial_heavy', pageSize: 100, maxPagesPerRun: 10, overlapMinutes: 120, fullSnapshotHours: 24 },
  accounting_entry: { priority: 'financial_heavy', pageSize: 100, maxPagesPerRun: 10, overlapMinutes: 180, fullSnapshotHours: null },
  bank_statement: { priority: 'financial_heavy', pageSize: 100, maxPagesPerRun: 10, overlapMinutes: 180, fullSnapshotHours: null },
  dte: { priority: 'financial_heavy', pageSize: 100, maxPagesPerRun: 10, overlapMinutes: 120, fullSnapshotHours: 12 },
};

export type RetryDecision = {
  retry: boolean;
  delayMs: number;
  terminal: boolean;
};

export function retryPolicy(status: number, attempt: number): RetryDecision {
  if (status === 401 || status === 403) return { retry: false, delayMs: 0, terminal: true };
  if (status === 429 || status >= 500) {
    const cappedAttempt = Math.max(0, Math.min(attempt, 5));
    return { retry: true, delayMs: Math.min(60_000, 1_000 * 2 ** cappedAttempt), terminal: false };
  }
  return { retry: false, delayMs: 0, terminal: status >= 400 };
}

export function shouldContinuePage(
  page: number,
  receivedRows: number,
  entityType: LaudusEntityType,
): boolean {
  const policy = LAUDUS_SYNC_POLICIES[entityType];
  return receivedRows === policy.pageSize && page + 1 < policy.maxPagesPerRun;
}


export type LaudusSyncDomain = 'products' | 'stock' | 'financial_masters';

export type LaudusSyncMetrics = {
  runId?: string | null;
  processed?: number;
  changed?: number;
  conflicts?: number;
  apiCalls?: number;
  metadata?: Record<string, unknown>;
};

async function getLaudusSourceId(supabase: any, organizationId: string) {
  const { data, error } = await supabase
    .from('laudus_source_status_service_v1')
    .select('source_id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !data?.source_id) throw new Error('Laudus source lookup failed');
  return String(data.source_id);
}

function nextSyncDueAt(domain: LaudusSyncDomain, now: Date) {
  const hours = domain === 'financial_masters' ? 24 : 6;
  return new Date(now.getTime() + hours * 60 * 60 * 1000).toISOString();
}

export async function markLaudusSyncRunning(
  supabase: any,
  organizationId: string,
  domain: LaudusSyncDomain,
) {
  const sourceId = await getLaudusSourceId(supabase, organizationId);
  const now = new Date().toISOString();
  const { error } = await supabase
    .schema('integration')
    .from('sync_domain_state')
    .upsert({
      organization_id: organizationId,
      source_id: sourceId,
      domain,
      health_status: 'running',
      last_started_at: now,
      last_error: null,
      updated_at: now,
    }, { onConflict: 'source_id,domain' });

  if (error) throw new Error('Laudus sync start state update failed');
}

export async function markLaudusSyncSuccess(
  supabase: any,
  organizationId: string,
  domain: LaudusSyncDomain,
  metrics: LaudusSyncMetrics,
) {
  const sourceId = await getLaudusSourceId(supabase, organizationId);
  const now = new Date();
  const nowIso = now.toISOString();
  const { error: stateError } = await supabase
    .schema('integration')
    .from('sync_domain_state')
    .upsert({
      organization_id: organizationId,
      source_id: sourceId,
      domain,
      last_run_id: metrics.runId || null,
      health_status: 'healthy',
      last_success_at: nowIso,
      next_due_at: nextSyncDueAt(domain, now),
      freshness_observed_at: nowIso,
      records_processed: Math.max(0, Math.trunc(metrics.processed || 0)),
      records_changed: Math.max(0, Math.trunc(metrics.changed || 0)),
      conflicts: Math.max(0, Math.trunc(metrics.conflicts || 0)),
      api_calls: Math.max(0, Math.trunc(metrics.apiCalls || 0)),
      consecutive_failures: 0,
      last_error: null,
      metadata: metrics.metadata || {},
      updated_at: nowIso,
    }, { onConflict: 'source_id,domain' });

  if (stateError) throw new Error('Laudus sync success state update failed');

  const { error: incidentError } = await supabase
    .schema('integration')
    .from('sync_incidents')
    .update({
      status: 'resolved',
      resolved_at: nowIso,
      last_seen_at: nowIso,
      updated_at: nowIso,
    })
    .eq('source_id', sourceId)
    .eq('domain', domain)
    .eq('status', 'open');

  if (incidentError) throw new Error('Laudus sync incident resolution failed');
}

export async function markLaudusSyncFailure(
  supabase: any,
  organizationId: string,
  domain: LaudusSyncDomain,
  syncError: unknown,
  metrics: LaudusSyncMetrics = {},
) {
  const sourceId = await getLaudusSourceId(supabase, organizationId);
  const nowIso = new Date().toISOString();
  const message = syncError instanceof Error ? syncError.message : 'Unknown Laudus sync failure';

  const { data: current, error: currentError } = await supabase
    .schema('integration')
    .from('sync_domain_state')
    .select('consecutive_failures')
    .eq('source_id', sourceId)
    .eq('domain', domain)
    .maybeSingle();

  if (currentError) throw new Error('Laudus sync failure state lookup failed');

  const failures = Math.max(0, Number(current?.consecutive_failures || 0)) + 1;
  const healthStatus = failures >= 3 ? 'broken' : 'degraded';

  const { error: stateError } = await supabase
    .schema('integration')
    .from('sync_domain_state')
    .upsert({
      organization_id: organizationId,
      source_id: sourceId,
      domain,
      last_run_id: metrics.runId || null,
      health_status: healthStatus,
      last_failure_at: nowIso,
      records_processed: Math.max(0, Math.trunc(metrics.processed || 0)),
      records_changed: Math.max(0, Math.trunc(metrics.changed || 0)),
      conflicts: Math.max(0, Math.trunc(metrics.conflicts || 0)),
      api_calls: Math.max(0, Math.trunc(metrics.apiCalls || 0)),
      consecutive_failures: failures,
      last_error: message.slice(0, 1000),
      metadata: metrics.metadata || {},
      updated_at: nowIso,
    }, { onConflict: 'source_id,domain' });

  if (stateError) throw new Error('Laudus sync failure state update failed');

  const incidentKey = domain + ':sync_failure';
  const { data: currentIncident, error: incidentLookupError } = await supabase
    .schema('integration')
    .from('sync_incidents')
    .select('id,occurrence_count')
    .eq('source_id', sourceId)
    .eq('domain', domain)
    .eq('fingerprint', incidentKey)
    .eq('status', 'open')
    .maybeSingle();

  if (incidentLookupError) throw new Error('Laudus sync incident lookup failed');

  if (currentIncident?.id) {
    const { error: updateError } = await supabase
      .schema('integration')
      .from('sync_incidents')
      .update({
        severity: failures >= 3 ? 'critical' : 'error',
        message: message.slice(0, 1000),
        details: metrics.metadata || {},
        last_seen_at: nowIso,
        occurrence_count: Math.max(1, Number(currentIncident.occurrence_count || 1)) + 1,
        last_run_id: metrics.runId || null,
        updated_at: nowIso,
      })
      .eq('id', currentIncident.id);

    if (updateError) throw new Error('Laudus sync incident update failed');
  } else {
    const { error: insertError } = await supabase
      .schema('integration')
      .from('sync_incidents')
      .insert({
        organization_id: organizationId,
        source_id: sourceId,
        domain,
        fingerprint: incidentKey,
        category: 'sync_failure',
        severity: failures >= 3 ? 'critical' : 'error',
        status: 'open',
        message: message.slice(0, 1000),
        details: metrics.metadata || {},
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        occurrence_count: 1,
        last_run_id: metrics.runId || null,
        created_at: nowIso,
        updated_at: nowIso,
      });

    if (insertError) throw new Error('Laudus sync incident insert failed');
  }
}
