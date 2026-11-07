import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/guard';
import { getModuleAccessLevel, isAdminRole, MODULE_KEYS } from '@/lib/api/module-access';

const NAMED_PROFILE_MANAGERS = new Set([
  'ariellopez@lapatagua.cl',
]);

export async function requireEeccProfileManager(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized || !auth.user || !auth.organizationId) {
    return {
      authorized: false as const,
      canDelete: false,
      auth,
      response: auth.response || NextResponse.json({ error: 'No autorizado' }, { status: 401 }),
    };
  }

  if (isAdminRole(auth.role)) {
    return { authorized: true as const, canDelete: true, auth, response: null };
  }

  const email = String(auth.user.email || '').trim().toLowerCase();
  const [legalAccess, contractsAccess] = await Promise.all([
    getModuleAccessLevel(auth.user.id, auth.role, MODULE_KEYS.LEGAL_EECC),
    getModuleAccessLevel(auth.user.id, auth.role, MODULE_KEYS.CONTRATOS_VISUALIZACION),
  ]);

  const canManage =
    legalAccess === 'ED' ||
    contractsAccess === 'ED' ||
    NAMED_PROFILE_MANAGERS.has(email);

  if (!canManage) {
    return {
      authorized: false as const,
      canDelete: false,
      auth,
      response: NextResponse.json({ error: 'No tienes permiso para gestionar perfiles de proveedores' }, { status: 403 }),
    };
  }

  return {
    authorized: true as const,
    canDelete: contractsAccess === 'ED',
    auth,
    response: null,
  };
}
