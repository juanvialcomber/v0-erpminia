export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const q = request.nextUrl.searchParams.get('q') || null;
  const status = request.nextUrl.searchParams.get('status') || 'all';
  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || 50), 1), 100);
  const offset = Math.max(Number(request.nextUrl.searchParams.get('offset') || 0), 0);

  const { data, error } = await context.supabase.rpc('motil_laudus_products_page', {
    p_organization_id: context.organizationId,
    p_query: q,
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    console.error('[laudus/products]', error);
    return NextResponse.json({ error: 'No fue posible cargar productos Laudus.' }, { status: 500 });
  }

  return NextResponse.json({
    source: 'Laudus',
    readOnly: true,
    ...data,
  });
}
