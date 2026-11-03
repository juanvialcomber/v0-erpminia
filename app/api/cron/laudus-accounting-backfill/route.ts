export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { runLaudusAccountingBackfill } from '@/lib/integrations/laudus/accounting-backfill';

const MAX_CALLS_PER_RUN = 10;
const MINIMUM_RESERVE = 200;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorized = Boolean(
    secret &&
    secret.length >= 24 &&
    request.headers.get('authorization') === `Bearer ${secret}`,
  );
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = await createClient();
  const { data: sources, error } = await db
    .from('laudus_source_status_service_v1')
    .select('organization_id')
    .eq('enabled', true)
    .limit(10);

  if (error) return NextResponse.json({ error: 'No se pudo leer el estado Laudus.' }, { status: 503 });

  const organizationIds = [
    ...new Set((sources || []).map((row: any) => String(row.organization_id || '')).filter(Boolean)),
  ];
  const results: Array<Record<string, unknown>> = [];

  for (const organizationId of organizationIds) {
    const { data: budget, error: budgetError } = await db
      .from('laudus_api_budget_service_v1')
      .select('monthly_limit, tracked_remaining, monthly_remaining_exact')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const remaining = Number(budget?.tracked_remaining || 0);
    const exact = budget?.monthly_remaining_exact === true;
    if (budgetError || !exact || remaining - MAX_CALLS_PER_RUN < MINIMUM_RESERVE) {
      results.push({
        organizationId,
        status: 'skipped',
        reason: budgetError ? 'budget_unavailable' : !exact ? 'budget_not_exact' : 'monthly_reserve',
        remaining,
        reserve: MINIMUM_RESERVE,
      });
      continue;
    }

    try {
      const result = await withLaudusApiUsageTracking(
        organizationId,
        () => runLaudusAccountingBackfill(organizationId, db, MAX_CALLS_PER_RUN),
      );
      results.push(result);
    } catch (error) {
      console.error('[laudus-accounting-backfill] run failed', {
        organizationId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      results.push({ organizationId, status: 'failed' });
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    maxCallsPerRun: MAX_CALLS_PER_RUN,
    reserve: MINIMUM_RESERVE,
    organizations: results,
  });
}
