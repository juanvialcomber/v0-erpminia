export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getInventoryConflictEvidence } from '@/lib/inventory-trust';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const organizationId = context.organizationId;
    const query = request.nextUrl.searchParams.get('q')?.trim() || '';
    const status = request.nextUrl.searchParams.get('status')?.trim() || '';

    let positionsQuery = context.supabase
      .from('inventory_intelligence_position_v1')
      .select('*')
      .eq('organization_id', organizationId)
      .order('stock_value', { ascending: false })
      .limit(200);

    if (status) positionsQuery = positionsQuery.eq('stock_status', status);
    if (query) positionsQuery = positionsQuery.or(`product_code.ilike.%${query}%,product_name.ilike.%${query}%`);

    const [overviewResult, positionsResult, dieselPositionResult, dieselReferenceResult, conflictEvidence] = await Promise.all([
      context.supabase.from('inventory_intelligence_overview_v1').select('*').eq('organization_id', organizationId).maybeSingle(),
      positionsQuery,
      context.supabase
        .from('inventory_intelligence_position_v1')
        .select('stock_id,product_id,product_code,product_name,family,unit,quantity_available,quantity_reserved,unit_cost,stock_value,stock_status,last_counted_date,warehouse_code,validation_status')
        .eq('organization_id', organizationId)
        .eq('product_code', 'Combustible001')
        .order('last_counted_date', { ascending: false, nullsFirst: false })
        .limit(1),
      context.supabase
        .from('canonical_products_v1')
        .select('product_code,name,unit,standard_cost,source_file,source_payload,imported_at,updated_at')
        .eq('organization_id', organizationId)
        .eq('product_code', 'Combustible001')
        .maybeSingle(),
      getInventoryConflictEvidence(context.supabase, organizationId),
    ]);

    const error = overviewResult.error || positionsResult.error || dieselPositionResult.error || dieselReferenceResult.error;
    if (error) throw error;

    const currentDiesel = dieselPositionResult.data?.[0] || null;
    const dieselReference = dieselReferenceResult.data || null;
    const hasDieselConflict = conflictEvidence.conflictCodes.has('COMBUSTIBLE001');

    return NextResponse.json({
      overview: overviewResult.data || null,
      positions: positionsResult.data || [],
      diesel: currentDiesel || dieselReference ? {
        current: currentDiesel,
        reference: dieselReference,
        hasConflict: hasDieselConflict,
      } : null,
      source: 'public.inventory_intelligence_position_v1',
      canonical: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el inventario canónico';
    console.error('[inventory/intelligence]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
