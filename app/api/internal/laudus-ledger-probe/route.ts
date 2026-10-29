export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { runLaudusReadOnlySmokeTest } from '@/lib/integrations/laudus/client';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = getSupabaseServerClient();
  const { data: source, error } = await db
    .from('laudus_source_status_service_v1')
    .select('organization_id')
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();

  if (error || !source?.organization_id) {
    return NextResponse.json({ error: 'Laudus source unavailable' }, { status: 503 });
  }

  const before = await db
    .from('laudus_api_budget_service_v1')
    .select('tracked_calls_this_month,tracking_status,monthly_remaining_exact')
    .eq('organization_id', source.organization_id)
    .maybeSingle();

  const result = await withLaudusApiUsageTracking(
    String(source.organization_id),
    () => runLaudusReadOnlySmokeTest(),
  );

  const after = await db
    .from('laudus_api_budget_service_v1')
    .select('tracked_calls_this_month,tracking_status,monthly_remaining_exact')
    .eq('organization_id', source.organization_id)
    .maybeSingle();

  return NextResponse.json({
    ok: true,
    calls: result.calls,
    before: before.data || null,
    after: after.data || null,
    persisted: false,
  });
}
