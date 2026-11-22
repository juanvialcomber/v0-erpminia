export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

async function authorize(request: NextRequest, write: boolean): Promise<NextResponse | null> {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO, write);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (access.user.id !== context.userId || access.organizationId !== context.organizationId) {
    return NextResponse.json({ error: 'No se pudo verificar tu acceso a esta Bodega.' }, { status: 403 });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const denied = await authorize(request, true);
  if (denied) return denied;
  // The legacy inventory and movement writes are non-atomic and do not
  // represent the validated operational stock master.
  return NextResponse.json({
    error: 'Esta vía antigua de movimientos está deshabilitada. Registra la entrega desde la OT validada.',
  }, { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
}

export async function GET(request: NextRequest) {
  const denied = await authorize(request, false);
  if (denied) return denied;
  // Legacy unscoped movement history cannot be treated as canonical stock.
  return NextResponse.json({
    error: 'El historial anterior no representa el stock operativo. Consulta la trazabilidad de la OT.',
  }, { status: 410, headers: { 'Cache-Control': 'private, no-store' } });
}
