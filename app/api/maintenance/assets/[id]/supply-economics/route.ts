export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  const { data: asset, error: assetError } = await context.supabase
    .from('maintenance_canonical_assets_v1')
    .select('id,asset_code,name')
    .eq('organization_id', context.organizationId)
    .eq('id', id)
    .maybeSingle();
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 });

  const { data, error } = await context.supabase.rpc('motil_asset_laudus_parts_preview', {
    p_organization_id: context.organizationId,
    p_asset_id: id,
    p_scope_days: 365,
  });
  if (error) return NextResponse.json({ error: 'No fue posible construir el contexto económico de repuestos.' }, { status: 500 });

  return NextResponse.json({ asset, ...data, source: 'MOTIL work_order_parts + Laudus purchase history', generatedAt: new Date().toISOString() });
}
