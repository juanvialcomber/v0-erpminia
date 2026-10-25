export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadLaudusInvoicePoControl } from '@/lib/integrations/laudus/invoice-po-control';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const data = await loadLaudusInvoicePoControl(
      context.supabase,
      context.organizationId,
      25,
    );
    return NextResponse.json(data);
  } catch (error) {
    console.error('[laudus/invoice-po-control]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo evaluar el control previo al pago.' },
      { status: 500 },
    );
  }
}
