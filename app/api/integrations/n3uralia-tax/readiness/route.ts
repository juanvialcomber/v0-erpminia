export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import {
  getTaxCoreConfigurationState,
  getTaxCoreHealth,
  getTaxCoreReadiness,
} from '@/lib/integrations/n3uralia-tax/client';

export async function GET(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'La revisión tributaria requiere permisos de administración.' }, { status: 403 });
  }

  try {
    const [health, readiness] = await Promise.all([
      getTaxCoreHealth(),
      getTaxCoreReadiness(),
    ]);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      configuration: getTaxCoreConfigurationState(),
      health,
      readiness,
      boundary: {
        motilOwnsSiiCredentials: false,
        taxCoreOwnsSiiCredentials: true,
        siiWritesRequested: false,
        laudusMutated: false,
      },
    });
  } catch (error) {
    console.error('[n3uralia-tax/readiness]', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      ok: false,
      error: 'No fue posible verificar N3uralia Tax Core.',
      configuration: getTaxCoreConfigurationState(),
      siiWritesRequested: false,
    }, { status: 502 });
  }
}
