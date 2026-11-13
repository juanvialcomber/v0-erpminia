export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

// Discovery V1: do not conflate mining plans, procurement requests or payment
// requests with an approved engineering-project portfolio.
export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.PROD_TOPOGRAFIA);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  return NextResponse.json({
    portfolio: { status: 'awaiting_canonical_intake', projects: [], total: null },
    requests: { status: 'workflow_not_approved', items: [], total: null },
    controls: {
      readOnly: true,
      approvalsEnabled: false,
      budgetsConnected: false,
      verifiedPhysicalProgressAvailable: false,
    },
    nextAction: 'Validar circuito de autorizaciones e inventario de proyectos con Ingeniería.',
    source: 'engineering_projects_discovery_v1',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
