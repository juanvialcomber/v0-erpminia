export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import {
  loadProcurementReconciliationExceptions,
  loadProcurementReconciliationSummary,
} from '@/lib/integrations/laudus/procurement-reconciliation';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [summary, exceptions] = await Promise.all([
      loadProcurementReconciliationSummary(context.supabase, context.organizationId),
      loadProcurementReconciliationExceptions(context.supabase, context.organizationId, 50),
    ]);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary,
      exceptions,
      policy: 'preview_only',
    });
  } catch (error) {
    console.error('[laudus/procurement-reconciliation-preview]', error);
    return NextResponse.json(
      { error: 'No fue posible calcular la conciliación histórica de compras.' },
      { status: 500 },
    );
  }
}
