export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { loadLaudusMasterReadiness } from '@/lib/integrations/laudus/master-readiness';

export async function GET(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json(
      { error: 'La preparación de migración Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const readiness = await loadLaudusMasterReadiness(context.supabase, context.organizationId);
    const total = readiness.rows.reduce((sum, row) => sum + row.total, 0);
    const identityReady = readiness.rows.reduce((sum, row) => sum + row.identityReady, 0);
    const linked = readiness.rows.reduce((sum, row) => sum + row.linkedToLaudus, 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: {
        configured: Boolean(readiness.sourceId),
        enabled: readiness.sourceEnabled,
      },
      summary: {
        total,
        identityReady,
        identityCoverage: total ? Math.round((identityReady / total) * 1000) / 10 : 0,
        linked,
        linkCoverage: total ? Math.round((linked / total) * 1000) / 10 : 0,
      },
      rows: readiness.rows,
    });
  } catch (error) {
    console.error('[laudus/master-readiness]', error);
    return NextResponse.json(
      { error: 'No fue posible calcular la preparación de maestros para Laudus.' },
      { status: 500 },
    );
  }
}
