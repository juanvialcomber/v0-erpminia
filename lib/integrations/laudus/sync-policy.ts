import { type LaudusEntityType } from './model';

export type SyncPriority = 'master' | 'transactional' | 'financial_heavy';

export const LAUDUS_AUTHORITY_POLICY = Object.freeze({
  upstreamMode: 'read_only',
  autoMergeCanonical: false,
  autoOverwriteOperationalTruth: false,
  humanReviewRequiredForConflicts: true,
  laudusFinancialAuthority: true,
  motilOperationalAuthority: true,
} as const);

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
