export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { isAuthorizedPataguaEmail } from '@/lib/auth/patagua-email-policy';
import {
  createOrganizationUser,
  deleteOrganizationUser,
  listOrganizationUsers,
  updateOrganizationUserRole,
} from '@/lib/api/admin-data';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.user || !auth.organizationId) {
    return auth.response || NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const users = await listOrganizationUsers(auth.organizationId);
    return NextResponse.json({ users });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar los usuarios';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.user || !auth.organizationId) {
    return auth.response || NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { email, password, full_name, cargo_id } = body;

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Todos los campos son obligatorios' }, { status: 400 });
    }

    if (!cargo_id) {
      return NextResponse.json({ error: 'Debes seleccionar un cargo' }, { status: 400 });
    }

    if (!isAuthorizedPataguaEmail(email)) {
      return NextResponse.json({ error: 'Solo se permiten correos @lapatagua.cl y el administrador autorizado.' }, { status: 400 });
    }

    const user = await createOrganizationUser({
      organizationId: auth.organizationId,
      email,
      password,
      fullName: full_name,
      cargoId: cargo_id,
      assignedBy: auth.user.id,
    });

    return NextResponse.json({ message: 'Usuario creado', user }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear el usuario';
    const status = message === 'User already exists' ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.user || !auth.organizationId) {
    return auth.response || NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { userId, role, full_name, cargo_id, status } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId es obligatorio' }, { status: 400 });
    }

    if (status != null && !['active', 'inactive'].includes(String(status))) {
      return NextResponse.json({ error: 'Estado inválido' }, { status: 400 });
    }

    const db = getSupabaseServerClient();
    const { data: existing, error: existingError } = await db
      .from('profiles')
      .select('id,email')
      .eq('id', userId)
      .eq('organization_id', auth.organizationId)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    if (status === 'active' && !isAuthorizedPataguaEmail(existing.email)) {
      return NextResponse.json({ error: 'No se puede activar un usuario fuera de la política de correos.' }, { status: 403 });
    }

    if (cargo_id) {
      const { data: cargo, error: cargoError } = await db
        .from('cargos')
        .select('id')
        .eq('id', cargo_id)
        .maybeSingle();
      if (cargoError) throw cargoError;
      if (!cargo) return NextResponse.json({ error: 'Cargo no válido' }, { status: 400 });
    }

    const profileUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof full_name === 'string' && full_name.trim()) {
      const normalized = full_name.trim();
      const [firstName, ...lastNameParts] = normalized.split(/\s+/);
      profileUpdate.full_name = normalized;
      profileUpdate.first_name = firstName;
      profileUpdate.last_name = lastNameParts.join(' ') || null;
    }
    if (cargo_id) profileUpdate.cargo_id = cargo_id;
    if (status != null) profileUpdate.status = status;

    if (Object.keys(profileUpdate).length > 1) {
      const { error: profileError } = await db
        .from('profiles')
        .update(profileUpdate)
        .eq('id', userId)
        .eq('organization_id', auth.organizationId);
      if (profileError) throw profileError;

      const peopleUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (profileUpdate.full_name) peopleUpdate.full_name = profileUpdate.full_name;
      if (status != null) peopleUpdate.employment_status = status === 'active' ? 'active' : 'inactive';
      if (Object.keys(peopleUpdate).length > 1) {
        const { error: peopleError } = await db
          .from('people')
          .update(peopleUpdate)
          .eq('profile_id', userId)
          .eq('organization_id', auth.organizationId);
        if (peopleError) throw peopleError;
      }
    }

    if (role) {
      await updateOrganizationUserRole({
        organizationId: auth.organizationId,
        userId,
        role,
        assignedBy: auth.user.id,
      });
    }

    return NextResponse.json({ message: 'Usuario actualizado' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo actualizar el usuario';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.user || !auth.organizationId) {
    return auth.response || NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId es obligatorio' }, { status: 400 });
    }

    await deleteOrganizationUser({
      organizationId: auth.organizationId,
      userId,
    });

    return NextResponse.json({ message: 'Usuario eliminado' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo eliminar el usuario';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
