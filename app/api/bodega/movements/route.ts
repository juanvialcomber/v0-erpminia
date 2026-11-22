export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (access.user.id !== context.userId || access.organizationId !== context.organizationId) {
    return NextResponse.json({ error: 'No se pudo verificar tu acceso a esta Bodega.' }, { status: 403 });
  }
  // Former implementation created a movement before separately updating stock.
  // Without an atomic transaction and validated voucher, retries can create
  // duplicate movements and incorrect balances.
  return NextResponse.json({
    error: 'El registro directo de movimientos no está habilitado. Usa el flujo de materiales de la OT o solicita revisión de Bodega.',
  }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
}
