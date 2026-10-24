export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { loadLaudusFinanceReview } from '@/lib/integrations/laudus/finance-review';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const result = await loadLaudusFinanceReview(
      getSupabaseServerClient(),
      context.organizationId,
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error('[laudus/finance-review]', error);
    return NextResponse.json(
      { error: 'No fue posible priorizar la revisión financiera de Laudus.' },
      { status: 500 },
    );
  }
}
