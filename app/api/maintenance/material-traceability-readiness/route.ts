export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_GERENCIAL);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase.rpc('motil_material_traceability_readiness', {
    p_organization_id: context.organizationId,
    p_limit: 25,
  });

  if (error) {
    console.error('[maintenance/material-traceability-readiness]', error);
    return NextResponse.json({ error: 'No fue posible evaluar la trazabilidad económica de las OT.' }, { status: 500 });
  }

  return NextResponse.json({
    ...data,
    source: 'MOTIL OT + Bodega + Laudus',
    readOnly: true,
    generatedAt: new Date().toISOString(),
  });
}
