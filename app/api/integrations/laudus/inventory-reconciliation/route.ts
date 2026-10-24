export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const limitParam = Number(request.nextUrl.searchParams.get('limit') || 50);
  const offsetParam = Number(request.nextUrl.searchParams.get('offset') || 0);
  const limit = Math.max(1, Math.min(Number.isFinite(limitParam) ? limitParam : 50, 200));
  const offset = Math.max(0, Number.isFinite(offsetParam) ? offsetParam : 0);

  const db = getSupabaseServerClient();
  const [{ data: summary, error: summaryError }, { data: queue, error: queueError }] = await Promise.all([
    db.rpc('motil_get_laudus_inventory_reconciliation_summary', {
      p_organization_id: context.organizationId,
    }),
    db.rpc('motil_get_laudus_inventory_reconciliation_queue', {
      p_organization_id: context.organizationId,
      p_limit: limit,
      p_offset: offset,
    }),
  ]);

  if (summaryError || queueError) {
    console.error('[laudus/inventory-reconciliation]', {
      summary: summaryError?.message,
      queue: queueError?.message,
    });
    return NextResponse.json(
      { error: 'No fue posible cargar la conciliación Laudus.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: summary || {},
    queue: queue || [],
    pagination: { limit, offset },
    policy: {
      source: 'Laudus',
      sourceRole: 'erp_evidence',
      motilRole: 'operational_truth',
      autoApply: false,
      warehouseMappingRequired: true,
    },
  });
}
