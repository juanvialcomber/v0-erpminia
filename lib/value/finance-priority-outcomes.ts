export type FinancePriorityKey =
  | 'freshness'
  | 'overdue'
  | 'due-soon'
  | 'supplier-concentration'
  | 'deposit'
  | 'cost-centers'
  | 'accounting';

type FinanceControlLike = {
  payments?: { pendingDeposit?: number | null };
  accountsPayable?: {
    overdueAmountClp?: number | null;
    dueSoonAmountClp?: number | null;
    topSupplierSharePct?: number | null;
  };
  costCenters?: { unresolved?: number | null };
  accounting?: { currentEnoughForExecutiveUse?: boolean | null };
  freshness?: { operationalSyncAgeDays?: number | null };
};

export type FinancePriorityObservation = {
  metric: string;
  value: number | boolean | null;
  direction: 'down' | 'up';
  unit: string;
  semantics: string;
};

export function financePriorityObservation(
  priorityKey: FinancePriorityKey,
  control: FinanceControlLike,
): FinancePriorityObservation {
  switch (priorityKey) {
    case 'freshness':
      return {
        metric: 'operational_sync_age_days',
        value: Number.isFinite(Number(control.freshness?.operationalSyncAgeDays))
          ? Number(control.freshness?.operationalSyncAgeDays)
          : null,
        direction: 'down',
        unit: 'days',
        semantics: 'Laudus operational source age; lower is fresher',
      };
    case 'overdue':
      return {
        metric: 'overdue_amount_clp',
        value: Number.isFinite(Number(control.accountsPayable?.overdueAmountClp))
          ? Number(control.accountsPayable?.overdueAmountClp)
          : null,
        direction: 'down',
        unit: 'CLP',
        semantics: 'open overdue amount observed in Laudus source state; not final accounting liability',
      };
    case 'due-soon':
      return {
        metric: 'due_soon_amount_clp',
        value: Number.isFinite(Number(control.accountsPayable?.dueSoonAmountClp))
          ? Number(control.accountsPayable?.dueSoonAmountClp)
          : null,
        direction: 'down',
        unit: 'CLP',
        semantics: 'amount due within 7 days observed in Laudus source state',
      };
    case 'supplier-concentration':
      return {
        metric: 'top_supplier_share_pct',
        value: Number.isFinite(Number(control.accountsPayable?.topSupplierSharePct))
          ? Number(control.accountsPayable?.topSupplierSharePct)
          : null,
        direction: 'down',
        unit: 'pct',
        semantics: 'share of open CLP payables concentrated in the largest supplier',
      };
    case 'deposit':
      return {
        metric: 'pending_deposit_count',
        value: Number.isFinite(Number(control.payments?.pendingDeposit))
          ? Number(control.payments?.pendingDeposit)
          : null,
        direction: 'down',
        unit: 'records',
        semantics: 'Laudus payment records not marked deposited; source state only',
      };
    case 'cost-centers':
      return {
        metric: 'unresolved_cost_centers',
        value: Number.isFinite(Number(control.costCenters?.unresolved))
          ? Number(control.costCenters?.unresolved)
          : null,
        direction: 'down',
        unit: 'centers',
        semantics: 'pending, candidate or conflict cost-center reconciliations',
      };
    case 'accounting':
      return {
        metric: 'accounting_current_for_executive_use',
        value: Boolean(control.accounting?.currentEnoughForExecutiveUse),
        direction: 'up',
        unit: 'boolean',
        semantics: 'whether accounting evidence is current enough for executive use under the existing 90-day gate',
      };
  }
}

export function financePriorityOutcome(
  baseline: FinancePriorityObservation | null | undefined,
  current: FinancePriorityObservation | null | undefined,
) {
  if (!baseline || !current || baseline.metric !== current.metric) {
    return { state: 'UNMEASURABLE' as const, delta: null as number | null };
  }

  if (typeof baseline.value === 'boolean' || typeof current.value === 'boolean') {
    if (typeof baseline.value !== 'boolean' || typeof current.value !== 'boolean') {
      return { state: 'UNMEASURABLE' as const, delta: null as number | null };
    }
    if (baseline.value === current.value) {
      return { state: 'UNCHANGED' as const, delta: null as number | null };
    }
    return {
      state: current.value ? 'IMPROVED' as const : 'WORSENED' as const,
      delta: null as number | null,
    };
  }

  if (!Number.isFinite(Number(baseline.value)) || !Number.isFinite(Number(current.value))) {
    return { state: 'UNMEASURABLE' as const, delta: null as number | null };
  }

  const before = Number(baseline.value);
  const after = Number(current.value);
  const delta = after - before;

  if (delta === 0) return { state: 'UNCHANGED' as const, delta };
  const improved = baseline.direction === 'down' ? delta < 0 : delta > 0;
  return { state: improved ? 'IMPROVED' as const : 'WORSENED' as const, delta };
}
