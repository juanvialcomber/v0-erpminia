export const dynamic = 'force-dynamic';

import { after, NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { syncLaudusFinancialMasters } from '@/lib/integrations/laudus/financial-master-sync';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';

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
      return NextResponse.json({ error: 'No autorizado para sincronizar maestros Laudus.' }, { status: 403 });
    }

    const organizationId = context.organizationId;
    after(async () => {
      try {
        const manualDb = await createClient();
        const result = await withLaudusApiUsageTracking(organizationId, () => syncLaudusFinancialMasters(organizationId, manualDb));
        console.info('[laudus-financial-masters-daily] manual sync completed', {
          organizationId,
          status: result.status,
        });
      } catch (error) {
        console.error('[laudus-financial-masters-daily] manual sync failed', {
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
      results.push(await withLaudusApiUsageTracking(String(organizationId), () => syncLaudusFinancialMasters(String(organizationId), db)));
    } catch (error) {
      console.error('[laudus-financial-masters-daily] sync failed', {
        organizationId,
        message: error instanceof Error ? error.message : 'unknown',
      });
      results.push({ organizationId, status: 'failed' });
    }
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    organizations: results.length,
    results,
  });
}
