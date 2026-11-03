export const dynamic = 'force-dynamic';

import { after, NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { syncLaudusStockDaily } from '@/lib/integrations/laudus/stock-sync';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { runLaudusAccountingBackfill } from '@/lib/integrations/laudus/accounting-backfill';

const BACKFILL_FALLBACK_CALLS = 30;
const BACKFILL_MONTHLY_RESERVE = 200;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const cronAuthorized = Boolean(
    secret &&
    secret.length >= 24 &&
    request.headers.get('authorization') === `Bearer ${secret}`
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
    organizationIds = [...new Set((sources || []).map((row: any) => String(row.organization_id || '')).filter(Boolean))];
  } else if (manualRequested) {
    const context = await getOrganizationContext(request);
    if (!context.ok) return context.response;

    const allowedRoles = new Set(['superadmin', 'admin', 'operaciones-supervisor', 'jefe_mantencion']);
    const role = String(context.role || '').trim().toLowerCase();
    if (!allowedRoles.has(role)) {
      return NextResponse.json({ error: 'No autorizado para sincronizar Laudus.' }, { status: 403 });
    }

    organizationIds = [context.organizationId];

    const organizationId = context.organizationId;
    after(async () => {
      try {
        const manualDb = await createClient();
        const result = await withLaudusApiUsageTracking(organizationId, () => syncLaudusStockDaily(organizationId, manualDb));
        console.info('[laudus-stock-daily] manual sync completed', {
          organizationId,
          status: result.status,
          runId: result.runId || null,
          staged: result.staged || 0,
          changed: result.changed || 0,
        });
      } catch (error) {
        console.error('[laudus-stock-daily] manual sync failed', {
          organizationId,
          message: error instanceof Error ? error.message : 'unknown',
        });
      }
    });

    return NextResponse.json({
      accepted: true,
      organizationId,
      status: 'accepted',
      generatedAt: new Date().toISOString(),
    }, { status: 202 });
  } else {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const organizationId of organizationIds) {
    try {
      results.push(await withLaudusApiUsageTracking(String(organizationId), () => syncLaudusStockDaily(String(organizationId), db)));
    } catch (error) {
      console.error('[laudus-stock-daily] sync failed', {
        organizationId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      results.push({ organizationId, status: 'failed' });
    }
  }

  if (cronAuthorized) {
    for (const organizationId of organizationIds) {
      after(async () => {
        try {
          const fallbackDb = await createClient();
          const { data: budget, error: budgetError } = await fallbackDb
            .from('laudus_api_budget_service_v1')
            .select('tracked_remaining, monthly_remaining_exact')
            .eq('organization_id', organizationId)
            .maybeSingle();

          const remaining = Number(budget?.tracked_remaining || 0);
          if (
            budgetError ||
            budget?.monthly_remaining_exact !== true ||
            remaining - BACKFILL_FALLBACK_CALLS < BACKFILL_MONTHLY_RESERVE
          ) {
            console.info('[laudus-stock-daily] accounting backfill fallback skipped', {
              organizationId,
              reason: budgetError
                ? 'budget_unavailable'
                : budget?.monthly_remaining_exact !== true
                  ? 'budget_not_exact'
                  : 'monthly_reserve',
              remaining,
            });
            return;
          }

          const backfill = await withLaudusApiUsageTracking(
            organizationId,
            () => runLaudusAccountingBackfill(organizationId, fallbackDb, BACKFILL_FALLBACK_CALLS),
          );
          console.info('[laudus-stock-daily] accounting backfill fallback completed', {
            organizationId,
            status: backfill.status,
            apiCalls: backfill.apiCalls,
            rowsStaged: backfill.rowsStaged,
          });
        } catch (error) {
          console.error('[laudus-stock-daily] accounting backfill fallback failed', {
            organizationId,
            message: error instanceof Error ? error.message : 'unknown',
          });
        }
      });
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    organizations: results.length,
    results,
  });
}
