export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { recoverOpenInvoiceDetails } from '@/lib/integrations/laudus/open-invoice-detail-recovery';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS, true);
  if (!access.authorized) return access.response;
  if (!access.canWrite) {
    return NextResponse.json({ error: 'No tienes permiso para recuperar detalle de facturas.' }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const db = getSupabaseServerClient();
    const result = await withLaudusApiUsageTracking(
      context.organizationId,
      () => recoverOpenInvoiceDetails(db, context.organizationId),
    );

    return NextResponse.json({
      ok: true,
      result,
      policy: {
        maxPerRun: 12,
        minimumApiReserve: 200,
        canonicalMutationExecuted: false,
        laudusWriteBack: false,
        stagingOnly: true,
      },
    });
  } catch (error) {
    console.error('[laudus/open-invoice-detail-recovery]', {
      organizationId: context.organizationId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json(
      { error: 'No fue posible recuperar el detalle acotado de facturas abiertas.' },
      { status: 500 },
    );
  }
}
