export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const rawScope = Number(request.nextUrl.searchParams.get('days') || 365);
  const scopeDays = Number.isFinite(rawScope)
    ? Math.min(Math.max(Math.trunc(rawScope), 90), 730)
    : 365;

  const { data, error } = await context.supabase.rpc('motil_supply_risk_preview', {
    p_organization_id: context.organizationId,
    p_scope_days: scopeDays,
  });

  if (error) {
    console.error('[procurement/supply-risk]', error);
    return NextResponse.json(
      { error: 'No fue posible calcular el riesgo de abastecimiento.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ...data,
    readOnly: true,
    generatedAt: new Date().toISOString(),
  });
}
