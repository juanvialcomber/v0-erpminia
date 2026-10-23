export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadLaudusAccountingReadiness } from '@/lib/integrations/laudus/accounting-readiness';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const readiness = await loadLaudusAccountingReadiness(context.supabase, context.organizationId);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ...readiness,
    });
  } catch (error) {
    console.error('[laudus/accounting-readiness]', error);
    return NextResponse.json(
      { error: 'No fue posible calcular la preparación contable.' },
      { status: 500 },
    );
  }
}
