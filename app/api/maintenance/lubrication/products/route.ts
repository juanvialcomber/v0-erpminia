export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (level !== 'ED' && level !== 'LEC') {
    return NextResponse.json({ error: 'Sin acceso a lubricantes de Bodega.' }, { status: 403 });
  }

  const { data, error } = await context.supabase
    .from('inventory_intelligence_position_v1')
    .select('product_id,product_code,product_name,family,unit,quantity_available,unit_cost,stock_value,warehouse_code,validation_status')
    .eq('organization_id', context.organizationId)
    .eq('family', 'Lubricante')
    .order('product_name', { ascending: true })
    .limit(500);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    rows: data || [],
    source: 'inventory_intelligence_position_v1',
    canonicalStockMutated: false,
  });
}
