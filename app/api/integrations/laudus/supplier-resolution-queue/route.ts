export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadSupplierResolutionQueue } from '@/lib/integrations/laudus/supplier-resolution-queue';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const result = await loadSupplierResolutionQueue(
      context.supabase,
      context.organizationId,
      20,
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ...result,
      policy: 'review_only',
    });
  } catch (error) {
    console.error('[laudus/supplier-resolution-queue]', error);
    return NextResponse.json(
      { error: 'No fue posible cargar proveedores históricos por resolver.' },
      { status: 500 },
    );
  }
}
