import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const level = await getModuleAccessLevel(ctx.userId, ctx.role, MODULE_KEYS.LEGAL_MODULO);
  if (level !== 'ED' && level !== 'LEC') return NextResponse.json({ error: 'Sin acceso a evidencia HSE' }, { status: 403 });
  const moduleName = request.nextUrl.searchParams.get('module');
  const targetId = request.nextUrl.searchParams.get('id') || '';
  if (!['assets','maintenance','people'].includes(moduleName || '') || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
    return NextResponse.json({ error: 'Destino inválido' }, { status: 400 });
  }
  const { data, error } = await ctx.supabase.rpc('list_hse_controls_for_target', {
    p_org: ctx.organizationId, p_module: moduleName, p_target: targetId,
  });
  if (error) return NextResponse.json({ error: 'No fue posible consultar evidencia asociada' }, { status: 502 });
  return NextResponse.json({ controls: data || [], readOnly: true });
}
