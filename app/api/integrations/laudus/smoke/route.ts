export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import {
  getLaudusConfigurationState,
  runLaudusReadOnlySmokeTest,
} from '@/lib/integrations/laudus/client';

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json(
      { error: 'La prueba Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  const configuration = getLaudusConfigurationState();
  if (!configuration.configured) {
    return NextResponse.json(
      {
        status: 'pending_configuration',
        configured: false,
        missing: configuration.missing,
        calls: 0,
        persisted: false,
      },
      { status: 503 },
    );
  }

  try {
    const result = await runLaudusReadOnlySmokeTest();
    return NextResponse.json({
      status: 'ok',
      configured: true,
      ...result,
    });
  } catch (error) {
    console.error('[laudus/smoke]', error instanceof Error ? error.message : 'Unknown Laudus error');
    return NextResponse.json(
      {
        status: 'failed',
        configured: true,
        calls: null,
        persisted: false,
        error: error instanceof Error ? error.message : 'No fue posible validar Laudus.',
      },
      { status: 502 },
    );
  }
}
