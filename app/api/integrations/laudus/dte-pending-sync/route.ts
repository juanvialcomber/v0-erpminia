export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { syncLaudusPendingDtes } from '@/lib/integrations/laudus/dte-sync';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'La sincronización DTE requiere permisos de administración.' }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const db = getSupabaseServerClient();
    const result = await withLaudusApiUsageTracking(
      context.organizationId,
      () => syncLaudusPendingDtes(context.organizationId, db),
    );
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('[laudus/dte-pending-sync]', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      error: 'No fue posible sincronizar DTE pendientes desde Laudus.',
      persisted: false,
      laudusMutated: false,
    }, { status: 502 });
  }
}
