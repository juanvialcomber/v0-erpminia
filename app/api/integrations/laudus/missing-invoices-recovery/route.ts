export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { recoverMissingPurchaseInvoices } from '@/lib/integrations/laudus/procurement-sync';

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;
  if (!access.canWrite) {
    return NextResponse.json({ error: 'No tienes permiso para recuperar facturas.' }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const result = await withLaudusApiUsageTracking(
      context.organizationId,
      () => recoverMissingPurchaseInvoices(context.organizationId, context.supabase),
    );

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      result,
      policy: {
        maxPerRun: 12,
        minimumApiReserve: 200,
        laudusWriteBack: false,
        canonicalMutationExecuted: false,
        source: 'Laudus',
      },
    });
  } catch (error) {
    console.error('[laudus/missing-invoices-recovery]', {
      organizationId: context.organizationId,
      message: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json(
      { error: 'No fue posible recuperar el lote de facturas faltantes.' },
      { status: 500 },
    );
  }
}
