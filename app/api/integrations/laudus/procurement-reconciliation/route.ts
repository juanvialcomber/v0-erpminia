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


export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;
  if (!access.canWrite) return NextResponse.json({ error: 'No tienes permiso para aplicar conciliaciones.' }, { status: 403 });

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null) as { limit?: number } | null;
  const limit = Math.max(1, Math.min(Number(body?.limit || 25), 100));

  try {
    const { data, error } = await context.supabase.rpc(
      'motil_apply_resolvable_purchase_order_reconciliation',
      {
        p_organization_id: context.organizationId,
        p_actor_user_id: context.userId,
        p_limit: limit,
      },
    );
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      result: data,
      policy: {
        humanTriggered: true,
        deterministicOnly: true,
        neverOverwriteExisting: true,
        laudusWriteBack: false,
      },
    });
  } catch (error) {
    console.error('[laudus/procurement-reconciliation:apply]', error);
    return NextResponse.json(
      { error: 'No fue posible aplicar el lote de conciliación.' },
      { status: 500 },
    );
  }
}
