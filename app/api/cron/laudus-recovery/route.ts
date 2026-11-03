export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { syncLaudusAccountingEntries } from '@/lib/integrations/laudus/journal-waybill-sync';
import { syncLaudusSuppliers } from '@/lib/integrations/laudus/procurement-sync';

const RECOVERY_CALL_BUDGET = 30;
const MINIMUM_MONTHLY_RESERVE = 200;
const COOLDOWN_MINUTES = 30;
const RECOVERABLE_DOMAINS = new Set(['accounting_entries', 'suppliers']);

type HealthRow = {
  organization_id: string;
  domain: string;
  health_status: string | null;
  last_failure_at: string | null;
  consecutive_failures: number | null;
};

function cooldownElapsed(lastFailureAt: string | null) {
  if (!lastFailureAt) return true;
  const ts = new Date(lastFailureAt).getTime();
  if (!Number.isFinite(ts)) return true;
  return Date.now() - ts >= COOLDOWN_MINUTES * 60 * 1000;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = Boolean(
    secret &&
    secret.length >= 24 &&
    request.headers.get('authorization') === `Bearer ${secret}`,
  );

  if (!authorized) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const db = await createClient();
  const { data: rows, error } = await db
    .from('laudus_sync_health_service_v1')
    .select('organization_id, domain, health_status, last_failure_at, consecutive_failures')
    .in('domain', [...RECOVERABLE_DOMAINS])
    .in('health_status', ['broken', 'degraded'])
    .gt('consecutive_failures', 0)
    .limit(20);

  if (error) {
    return NextResponse.json({ error: 'No se pudo leer el estado de recuperación Laudus.' }, { status: 503 });
  }

  const candidates = ((rows || []) as HealthRow[]).filter((row) =>
    RECOVERABLE_DOMAINS.has(String(row.domain || '')) &&
    cooldownElapsed(row.last_failure_at),
  );

  const byOrganization = new Map<string, HealthRow[]>();
  for (const row of candidates) {
    const organizationId = String(row.organization_id || '');
    if (!organizationId) continue;
    const list = byOrganization.get(organizationId) || [];
    list.push(row);
    byOrganization.set(organizationId, list);
  }

  const organizations: Array<Record<string, unknown>> = [];

  for (const [organizationId, domains] of byOrganization) {
    const { data: budget, error: budgetError } = await db
      .from('laudus_api_budget_service_v1')
      .select('monthly_limit, tracked_remaining, monthly_remaining_exact')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const remaining = Number(budget?.tracked_remaining || 0);
    const exact = budget?.monthly_remaining_exact === true;

    if (
      budgetError ||
      !exact ||
      remaining - RECOVERY_CALL_BUDGET < MINIMUM_MONTHLY_RESERVE
    ) {
      organizations.push({
        organizationId,
        status: 'skipped',
        reason: budgetError
          ? 'budget_unavailable'
          : !exact
            ? 'budget_not_exact'
            : 'monthly_reserve',
        remaining,
        reserve: MINIMUM_MONTHLY_RESERVE,
      });
      continue;
    }

    const results: Array<Record<string, unknown>> = [];

    for (const domain of ['accounting_entries', 'suppliers']) {
      if (!domains.some((row) => row.domain === domain)) continue;

      try {
        const result = await withLaudusApiUsageTracking(
          organizationId,
          () => domain === 'accounting_entries'
            ? syncLaudusAccountingEntries(organizationId, db)
            : syncLaudusSuppliers(organizationId, db),
        );
        results.push({ domain, status: 'completed', result });
      } catch (syncError) {
        console.error('[laudus-recovery] domain recovery failed', {
          organizationId,
          domain,
          message: syncError instanceof Error ? syncError.message : 'unknown',
        });
        results.push({ domain, status: 'failed' });
      }
    }

    organizations.push({
      organizationId,
      status: results.some((item) => item.status === 'failed') ? 'partial' : 'completed',
      results,
    });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    cooldownMinutes: COOLDOWN_MINUTES,
    maxPlannedCalls: RECOVERY_CALL_BUDGET,
    reserve: MINIMUM_MONTHLY_RESERVE,
    candidates: candidates.length,
    organizations,
  });
}
