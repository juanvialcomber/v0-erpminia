export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireEeccProfileManager } from '@/lib/api/eecc-profile-access';
import { deleteEecc, updateEecc } from '@/lib/api/eecc';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const manager = await requireEeccProfileManager(request);
  if (!manager.authorized || !manager.auth.organizationId) return manager.response;
  const auth = manager.auth;

  try {
    const { id } = await params;
    const body = await request.json();

    const eecc = await updateEecc(auth.organizationId, id, {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      rut: body.rut !== undefined ? String(body.rut).trim() : undefined,
      representative:
        body.representative !== undefined ? String(body.representative).trim() : undefined,
      email: body.email !== undefined ? String(body.email).trim() : undefined,
      phone: body.phone !== undefined ? String(body.phone).trim() : undefined,
      isActive: body.isActive,
      notes: body.notes !== undefined ? String(body.notes).trim() : undefined,
    });

    return NextResponse.json({ eecc });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar la EECC';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const manager = await requireEeccProfileManager(request);
  if (!manager.authorized || !manager.auth.organizationId) return manager.response;
  if (!manager.canDelete) {
    return NextResponse.json({ error: 'Eliminar perfiles requiere permiso contractual de edición' }, { status: 403 });
  }
  const auth = manager.auth;

  try {
    const { id } = await params;
    await deleteEecc(auth.organizationId, id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo eliminar la EECC';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
