export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess, MODULE_KEYS } from '@/lib/api/module-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getLaudus } from '@/lib/integrations/laudus/client';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';

function rowsFrom(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is Record<string, unknown> =>
      Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'rows']) {
    const rows = record[key];
    if (Array.isArray(rows)) {
      return rows.filter((row): row is Record<string, unknown> =>
        Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    }
  }
  return [];
}

function santiagoDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const requestedDate = String(request.nextUrl.searchParams.get('dateTo') || '').trim();
  const dateTo = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : santiagoDate();

  try {
    const payload = await withLaudusApiUsageTracking(
      context.organizationId,
      () => getLaudus('/accounting/balanceSheet/8Columns', {
        dateTo,
        showAccountsWithZeroBalance: false,
        showOnlyAccountsWithActivity: true,
        showLevels: true,
      }),
    );
    const allRows = rowsFrom(payload);
    if (allRows.length > 5000) {
      return NextResponse.json({
        error: 'El balance Laudus excede el límite seguro de consulta.',
        persisted: false,
        laudusMutated: false,
      }, { status: 409 });
    }
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      dateTo,
      records: allRows.length,
      persisted: false,
      source: 'Laudus',
      semantics: 'snapshot contable read-only; no se agregan clasificaciones jerárquicas sin semántica oficial verificada',
      laudusMutated: false,
    }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (error) {
    console.error('[laudus/balance-sheet]', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      error: 'No fue posible consultar el balance Laudus.',
      persisted: false,
      laudusMutated: false,
    }, { status: 502 });
  }
}
