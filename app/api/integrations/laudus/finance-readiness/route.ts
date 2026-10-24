export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadLaudusFinanceReadiness } from '@/lib/integrations/laudus/finance-readiness';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const readiness = await loadLaudusFinanceReadiness(
      getSupabaseServerClient(),
      context.organizationId,
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ...readiness,
    });
  } catch (error) {
    console.error('[laudus/finance-readiness]', error);
    return NextResponse.json(
      { error: 'No fue posible calcular la preparación financiera.' },
      { status: 500 },
    );
  }
}
