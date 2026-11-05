export const dynamic = 'force-dynamic';

import { type NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext } from '@/lib/api/auth-session';
import { getUserModuleAccess, isAdminRole } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);

  if (!auth?.user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const admin = isAdminRole(auth.role);
  const organizationId = auth.organizationId || auth.user.organization_id || null;
  const userAccess = await getUserModuleAccess(auth.user.id);
  const user = {
    id: auth.user.id,
    email: auth.user.email || null,
    fullName: auth.user.full_name || null,
  };

  if (admin) {
    return NextResponse.json({
      isAdmin: true,
      hasCargo: userAccess.hasCargo,
      cargoId: userAccess.cargoId,
      cargoName: userAccess.cargoName,
      role: auth.role || null,
      organizationId,
      source: auth.source,
      user,
      access: {},
    });
  }

  const { hasCargo, cargoId, cargoName, access } = userAccess;

  return NextResponse.json({
    isAdmin: false,
    hasCargo,
    cargoId,
    cargoName,
    role: auth.role || null,
    organizationId,
    source: auth.source,
    user,
    access,
  });
}
