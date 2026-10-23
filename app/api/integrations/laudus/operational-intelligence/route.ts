export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const rawScope = Number(request.nextUrl.searchParams.get('days') || 120);
  const scopeDays = Number.isFinite(rawScope) ? Math.min(Math.max(Math.trunc(rawScope), 30), 365) : 120;

  const [operational, threeWay, documentMatch] = await Promise.all([
    context.supabase.rpc('motil_laudus_operational_intelligence_preview', {
      p_organization_id: context.organizationId,
      p_scope_days: scopeDays,
    }),
    context.supabase.rpc('motil_laudus_three_way_match_preview', {
      p_organization_id: context.organizationId,
      p_scope_days: scopeDays,
    }),
    context.supabase.rpc('motil_laudus_document_match_preview', {
      p_organization_id: context.organizationId,
      p_scope_days: scopeDays,
    }),
  ]);

  if (operational.error || threeWay.error || documentMatch.error) {
    console.error('[laudus/operational-intelligence]', operational.error || threeWay.error || documentMatch.error);
    return NextResponse.json(
      { error: 'No fue posible calcular la inteligencia operacional de compras.' },
      { status: 500 },
    );
  }

  return NextResponse.json({
    source: 'Laudus',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    ...operational.data,
    threeWay: threeWay.data,
    documentMatch: documentMatch.data,
  });
}
