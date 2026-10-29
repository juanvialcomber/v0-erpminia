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


export type LaudusSyncDomain = 'products' | 'stock' | 'financial_masters' | 'suppliers' | 'procurement' | 'warehouses' | 'bank_statements' | 'accounting_entries' | 'waybills';

export type LaudusSyncMetrics = {
  runId?: string | null;
  processed?: number;
  changed?: number;
  conflicts?: number;
  apiCalls?: number;
  metadata?: Record<string, unknown>;
};

async function recordLaudusSyncControl(
  supabase: any,
  organizationId: string,
  domain: LaudusSyncDomain,
  event: 'running' | 'success' | 'failure',
  metrics: LaudusSyncMetrics = {},
  syncError?: unknown,
) {
  const message = syncError instanceof Error
    ? syncError.message
    : syncError == null
      ? null
      : String(syncError);

  const { error } = await supabase.rpc('motil_record_laudus_sync_control', {
    p_organization_id: organizationId,
    p_domain: domain,
    p_event: event,
    p_run_id: metrics.runId || null,
    p_processed: Math.max(0, Math.trunc(metrics.processed || 0)),
    p_changed: Math.max(0, Math.trunc(metrics.changed || 0)),
    p_conflicts: Math.max(0, Math.trunc(metrics.conflicts || 0)),
    p_api_calls: Math.max(0, Math.trunc(metrics.apiCalls || 0)),
    p_error: message?.slice(0, 1000) || null,
    p_metadata: metrics.metadata || {},
  });

  if (error) throw new Error('Laudus sync control update failed');
}

export async function markLaudusSyncRunning(
  supabase: any,
  organizationId: string,
  domain: LaudusSyncDomain,
) {
  await recordLaudusSyncControl(supabase, organizationId, domain, 'running');
}

export async function markLaudusSyncSuccess(
  supabase: any,
  organizationId: string,
  domain: LaudusSyncDomain,
  metrics: LaudusSyncMetrics,
) {
  await recordLaudusSyncControl(supabase, organizationId, domain, 'success', metrics);
}

export async function markLaudusSyncFailure(
  supabase: any,
  organizationId: string,
  domain: LaudusSyncDomain,
  syncError: unknown,
  metrics: LaudusSyncMetrics = {},
) {
  await recordLaudusSyncControl(supabase, organizationId, domain, 'failure', metrics, syncError);
}
