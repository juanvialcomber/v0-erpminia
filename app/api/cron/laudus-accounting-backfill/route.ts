export const dynamic = 'force-dynamic';

import { after, NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { runLaudusAccountingBackfill } from '@/lib/integrations/laudus/accounting-backfill';

const MAX_CALLS_PER_RUN = 30;
const MINIMUM_RESERVE = 200;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cronAuthorized = Boolean(
    secret &&
    secret.length >= 24 &&
    request.headers.get('authorization') === `Bearer ${secret}`,
  );
  const manualRequested = request.nextUrl.searchParams.get('manual') === '1';

  const db = await createClient();
  let organizationIds: string[] = [];

  if (cronAuthorized) {
    const { data: sources, error } = await db
      .from('laudus_source_status_service_v1')
      .select('organization_id')
      .eq('enabled', true)
      .limit(10);

    if (error) return NextResponse.json({ error: 'No se pudo leer el estado Laudus.' }, { status: 503 });

    organizationIds = [
      ...new Set((sources || []).map((row: any) => String(row.organization_id || '')).filter(Boolean)),
    ];
  } else if (manualRequested) {
    const context = await getOrganizationContext(request);
    if (!context.ok) return context.response;

    const allowedRoles = new Set(['superadmin', 'admin', 'operaciones-supervisor', 'jefe_mantencion']);
    const role = String(context.role || '').trim().toLowerCase();
    if (!allowedRoles.has(role)) {
      return NextResponse.json({ error: 'No autorizado para ejecutar el backfill Laudus.' }, { status: 403 });
    }

    const organizationId = context.organizationId;
    const { data: budget, error: budgetError } = await context.supabase
      .from('laudus_api_budget_service_v1')
      .select('monthly_limit, tracked_remaining, monthly_remaining_exact')
      .eq('organization_id', organizationId)
      .maybeSingle();

    const remaining = Number(budget?.tracked_remaining || 0);
    const exact = budget?.monthly_remaining_exact === true;
    if (budgetError || !exact || remaining - MAX_CALLS_PER_RUN < MINIMUM_RESERVE) {
      return NextResponse.json({
        accepted: false,
        status: 'skipped',
        reason: budgetError ? 'budget_unavailable' : !exact ? 'budget_not_exact' : 'monthly_reserve',
        remaining,
        reserve: MINIMUM_RESERVE,
      }, { status: 409 });
    }

    after(async () => {
      try {
        const manualDb = await createClient();
        const result = await withLaudusApiUsageTracking(
          organizationId,
          () => runLaudusAccountingBackfill(organizationId, manualDb, MAX_CALLS_PER_RUN),
        );
        console.info('[laudus-accounting-backfill] manual run completed', {
          organizationId,
          status: result.status,
          apiCalls: result.apiCalls,
          rowsStaged: result.rowsStaged,
        });
      } catch (error) {
        console.error('[laudus-accounting-backfill] manual run failed', {
          organizationId,
          message: error instanceof Error ? error.message : 'unknown',
        });
      }
    });

    return NextResponse.json({
      accepted: true,
      organizationId,
      status: 'accepted',
      maxCallsPerRun: MAX_CALLS_PER_RUN,
      reserve: MINIMUM_RESERVE,
      generatedAt: new Date().toISOString(),
    }, { status: 202 });
  } else {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
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
