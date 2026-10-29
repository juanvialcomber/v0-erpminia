export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { syncLaudusProcurement } from '@/lib/integrations/laudus/procurement-sync';

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

  const organizationIds = [...new Set((sources || []).map((row: any) => String(row.organization_id || '')).filter(Boolean))];
  const results: Array<Record<string, unknown>> = [];

  for (const organizationId of organizationIds) {
    try {
      results.push(await withLaudusApiUsageTracking(organizationId, () => syncLaudusProcurement(organizationId, db)));
    } catch (error) {
      console.error('[laudus-procurement-daily] sync failed', {
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
