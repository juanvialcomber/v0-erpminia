export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadLaudusFinanceControl } from '@/lib/integrations/laudus/finance-control';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const result = await loadLaudusFinanceControl(context.supabase, context.organizationId);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[laudus/finance-control]', error);
    return NextResponse.json({ error: 'No se pudo cargar el control Laudus.' }, { status: 500 });
  }
}
