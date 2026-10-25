export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { probeLaudusFixedAssetReadiness } from '@/lib/integrations/laudus/fixed-asset-readiness';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  try {
    const readiness = await probeLaudusFixedAssetReadiness();
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      ...readiness,
    });
  } catch (error) {
    console.error('[laudus/fixed-asset-readiness]', error);
    return NextResponse.json(
      { error: 'No fue posible verificar la cobertura de activos fijos Laudus.' },
      { status: 500 },
    );
  }
}
