export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase.rpc('motil_laudus_finance_summary', {
    p_organization_id: context.organizationId,
  });

  if (error) {
    console.error('[laudus/finance-live]', error);
    return NextResponse.json({ error: 'No fue posible cargar Finanzas desde Laudus.' }, { status: 500 });
  }

  return NextResponse.json({ source: 'Laudus', readOnly: true, ...data });
}
