export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadLaudusNativeInvoiceTrace } from '@/lib/integrations/laudus/native-invoice-trace';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const data = await loadLaudusNativeInvoiceTrace(
      context.supabase,
      context.organizationId,
    );
    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error) {
    console.error('[laudus/native-invoice-trace]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo consultar la trazabilidad nativa Laudus.' },
      { status: 502 },
    );
  }
}
