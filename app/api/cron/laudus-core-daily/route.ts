export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { syncLaudusProducts } from '@/lib/integrations/laudus/product-sync';
import { syncLaudusProcurement } from '@/lib/integrations/laudus/procurement-sync';
import { syncLaudusBankStatements } from '@/lib/integrations/laudus/bank-statement-sync';
import { syncLaudusDtePending } from '@/lib/integrations/laudus/dte-sync';
import {
  syncLaudusAccountingEntries,
  syncLaudusPurchaseWaybills,
} from '@/lib/integrations/laudus/journal-waybill-sync';

type DomainResult = {
  domain: string;
  status: string;
  result?: unknown;
};

const CORE_CALL_BUDGET = 20;
const MONTHLY_RESERVE_FRACTION = 0.10;

async function readBudgetGuard(db: any, organizationId: string) {
  const { data, error } = await db
    .from('laudus_api_budget_service_v1')
    .select('monthly_limit, tracked_remaining, monthly_remaining_exact')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (error || !data) {
    return {
      allowed: false,
      reason: 'budget_unavailable',
      monthlyLimit: null,
      remaining: null,
      reserve: null,
    };
  }

  const monthlyLimit = Number(data.monthly_limit || 0);
  const remaining = Number(data.tracked_remaining || 0);
  const exact = data.monthly_remaining_exact === true;
  const reserve = Math.max(100, Math.ceil(monthlyLimit * MONTHLY_RESERVE_FRACTION));

  if (!exact || monthlyLimit <= 0) {
    return {
      allowed: false,
      reason: 'budget_not_exact',
      monthlyLimit,
      remaining,
      reserve,
    };
  }

  return {
    allowed: remaining - CORE_CALL_BUDGET >= reserve,
    reason: remaining - CORE_CALL_BUDGET >= reserve ? null : 'monthly_reserve',
    monthlyLimit,
    remaining,
    reserve,
  };
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
  const { data: sources, error } = await db
    .from('laudus_source_status_service_v1')
    .select('organization_id')
    .eq('enabled', true)
    .limit(10);

  if (error) {
    return NextResponse.json({ error: 'No se pudo leer el estado Laudus.' }, { status: 503 });
  }

  const organizationIds = [
    ...new Set(
      (sources || [])
        .map((row: any) => String(row.organization_id || ''))
        .filter(Boolean),
    ),
  ];

  const organizations: Array<Record<string, unknown>> = [];

  for (const organizationId of organizationIds) {
    const budget = await readBudgetGuard(db, organizationId);
    if (!budget.allowed) {
      organizations.push({
        organizationId,
        status: 'skipped',
        reason: budget.reason,
        budget: {
          monthlyLimit: budget.monthlyLimit,
          remaining: budget.remaining,
          reserve: budget.reserve,
          plannedMaxCalls: CORE_CALL_BUDGET,
        },
      });
      continue;
    }

    const domainResults = await withLaudusApiUsageTracking(organizationId, async () => {
      const results: DomainResult[] = [];

      const run = async (domain: string, operation: () => Promise<unknown>) => {
        try {
          const result = await operation();
          results.push({ domain, status: 'completed', result });
        } catch (error) {
          console.error('[laudus-core-daily] domain sync failed', {
            organizationId,
            domain,
            message: error instanceof Error ? error.message : 'unknown',
          });
          results.push({ domain, status: 'failed' });
        }
      };

      await run('products', () => syncLaudusProducts(organizationId, db));
      await run('procurement', () => syncLaudusProcurement(organizationId, db));
      await run('bank_statements', () => syncLaudusBankStatements(organizationId, db));
      await run('accounting_entries', () => syncLaudusAccountingEntries(organizationId, db));
      await run('purchase_waybills', () => syncLaudusPurchaseWaybills(organizationId, db));
      await run('dtes', () => syncLaudusDtePending(organizationId, db));

      return results;
    });

    organizations.push({
      organizationId,
      status: domainResults.some((item) => item.status === 'failed') ? 'partial' : 'completed',
      domains: domainResults,
    });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    organizations,
  });
}
