export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/guard';
import { requireEeccProfileManager } from '@/lib/api/eecc-profile-access';
import { createEecc, listEeccForOrganization } from '@/lib/api/eecc';

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized || !auth.organizationId) {
    return auth.response || NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const params = new URL(request.url).searchParams;
    const search = params.get('search');
    const onlyActive = params.get('active') === 'true';
    const result = await listEeccForOrganization(auth.organizationId, { search, onlyActive });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar las EECC';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const manager = await requireEeccProfileManager(request);
  if (!manager.authorized) return manager.response;
  const auth = manager.auth;
  if (!auth.organizationId || !auth.user) {
    return NextResponse.json({ error: 'Contexto de organización no disponible' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const name = String(body.name || '').trim();

    if (!name) {
      return NextResponse.json({ error: 'El nombre de la empresa es obligatorio' }, { status: 400 });
    }

    const eecc = await createEecc({
      organizationId: auth.organizationId,
      createdBy: auth.source === 'supabase' ? auth.user.id : undefined,
      name,
      rut: String(body.rut || '').trim() || undefined,
      representative: String(body.representative || '').trim() || undefined,
      email: String(body.email || '').trim() || undefined,
      phone: String(body.phone || '').trim() || undefined,
      isActive: body.isActive !== false,
      notes: String(body.notes || '').trim() || undefined,
    });

    return NextResponse.json({ eecc }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear la EECC';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
