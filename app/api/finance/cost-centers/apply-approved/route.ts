export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => ({}));
  const limit = Math.max(1, Math.min(Number(body?.limit) || 25, 100));

  const { data, error } = await context.supabase.rpc('motil_apply_approved_laudus_cost_centers', {
    p_organization_id: context.organizationId,
    p_actor_user_id: context.userId,
    p_limit: limit,
  });

  if (error) {
    console.error('[finance/cost-centers/apply-approved] apply failed', {
      organizationId: context.organizationId,
      code: error.code,
    });
    return NextResponse.json({ error: 'No se pudieron aplicar los centros aprobados.' }, { status: 500 });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    result: data,
  });
}
