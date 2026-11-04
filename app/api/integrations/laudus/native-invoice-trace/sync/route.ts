export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { syncLaudusInvoiceTraceEvidence } from '@/lib/integrations/laudus/invoice-trace-sync';

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const result = await withLaudusApiUsageTracking(
      context.organizationId,
      () => syncLaudusInvoiceTraceEvidence(context.supabase, context.organizationId),
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('[laudus/invoice-trace-sync]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible sincronizar evidencia de trazas.' },
      { status: 502 },
    );
  }
}
