export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { syncLaudusSalesRaw } from '@/lib/integrations/laudus/sales-sync';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'La sincronización comercial Laudus requiere permisos de administración.' }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const db = getSupabaseServerClient();
    const result = await withLaudusApiUsageTracking(
      context.organizationId,
      () => syncLaudusSalesRaw(context.organizationId, db),
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('[laudus/sales-sync]', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      error: 'No fue posible sincronizar la capa comercial desde Laudus.',
      stagingOnly: true,
      canonicalMutated: false,
      laudusMutated: false,
    }, { status: 502 });
  }
}
