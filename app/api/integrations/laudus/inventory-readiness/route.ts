export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadLaudusInventoryReadiness } from '@/lib/integrations/laudus/inventory-readiness';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const readiness = await loadLaudusInventoryReadiness(getSupabaseServerClient(), context.organizationId);
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ...readiness,
    });
  } catch (error) {
    console.error('[laudus/inventory-readiness]', error);
    return NextResponse.json(
      { error: 'No fue posible calcular la preparación de inventario.' },
      { status: 500 },
    );
  }
}
