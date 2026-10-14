import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const level = await getModuleAccessLevel(ctx.userId, ctx.role, MODULE_KEYS.LEGAL_MODULO);
  if (level !== 'ED' && level !== 'LEC') {
    return NextResponse.json({ error: 'Sin acceso a controles HSE' }, { status: 403 });
  }
  const { data, error } = await ctx.supabase.rpc('list_hse_review_controls', {
    p_organization_id: ctx.organizationId,
  });
  if (error) return NextResponse.json({ error: 'No se pudieron cargar los controles HSE' }, { status: 502 });
  return NextResponse.json({ controls: data || [], readOnly: true });
}
