import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const level = await getModuleAccessLevel(ctx.userId, ctx.role, MODULE_KEYS.LEGAL_MODULO);
  if (level !== 'ED') return NextResponse.json({ error: 'Sin permisos de edición HSE' }, { status: 403 });
  const moduleName = request.nextUrl.searchParams.get('module');
  const sources = {
    assets: { table: 'canonical_assets_current', fields: 'id,name,asset_code' },
    maintenance: { table: 'maintenance_assets', fields: 'id,asset_code,serial_number' },
    people: { table: 'profiles', fields: 'id,full_name' },
  } as const;
  if (moduleName !== 'assets' && moduleName !== 'maintenance' && moduleName !== 'people')
    return NextResponse.json({ error: 'Módulo inválido' }, { status: 400 });
  const source = sources[moduleName];
  const { data, error } = await ctx.supabase.from(source.table)
    .select(source.fields).eq('organization_id', ctx.organizationId).limit(200);
  if (error) return NextResponse.json({ error: 'No fue posible consultar registros' }, { status: 502 });
  const options = (data || []).map((row) => {
    const item = row as unknown as Record<string, string | null>;
    return { id: item.id, label: item.name || item.full_name || item.asset_code || item.serial_number || 'Sin nombre' };
  });
  return NextResponse.json({ options });
}
