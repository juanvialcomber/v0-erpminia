export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import {
  getLaudusConfigurationState,
  LaudusApiError,
  runLaudusReadOnlySmokeTest,
} from '@/lib/integrations/laudus/client';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.organizationId) {
    return NextResponse.json({ error: 'Organización no disponible.' }, { status: 400 });
  }
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
    const result = await withLaudusApiUsageTracking(access.organizationId, () => runLaudusReadOnlySmokeTest());
    return NextResponse.json({
      status: 'ok',
      configured: true,
      ...result,
    });
  } catch (error) {
    const laudusError = error instanceof LaudusApiError ? error : null;
    console.error('[laudus/smoke]', laudusError
      ? { status: laudusError.status, path: laudusError.path, upstreamCode: laudusError.upstreamCode }
      : error instanceof Error ? error.message : 'Unknown Laudus error');
    return NextResponse.json(
      {
        status: 'failed',
        configured: true,
        calls: null,
        persisted: false,
        stage: laudusError?.path || null,
        upstreamStatus: laudusError?.status || null,
        upstreamCode: laudusError?.upstreamCode || null,
        error: error instanceof Error ? error.message : 'No fue posible validar Laudus.',
      },
      { status: 502 },
    );
  }
}


// Temporary authenticated smoke alias. Remove after production validation.
export const GET = POST;
