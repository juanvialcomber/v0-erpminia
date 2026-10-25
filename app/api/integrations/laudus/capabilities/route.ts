export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { loadLaudusCapabilityMatrix } from '@/lib/integrations/laudus/capability-matrix';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  try {
    const matrix = await loadLaudusCapabilityMatrix();
    return NextResponse.json(matrix);
  } catch (error) {
    console.error('[laudus/capabilities]', error);
    return NextResponse.json(
      { error: 'No fue posible verificar las capacidades disponibles en Laudus.' },
      { status: 502 },
    );
  }
}
