export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import {
  getLaudusConfigurationState,
  LaudusApiError,
  runLaudusReadOnlyValueProbe,
} from '@/lib/integrations/laudus/client';

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const configuration = getLaudusConfigurationState();
  if (!configuration.configured) {
    return NextResponse.json(
      { status: 'pending_configuration', configured: false, calls: 0, persisted: false },
      { status: 503 },
    );
  }

  try {
    const result = await runLaudusReadOnlyValueProbe();
    return NextResponse.json({ status: 'ok', configured: true, ...result });
  } catch (error) {
    const laudusError = error instanceof LaudusApiError ? error : null;
    console.error('[laudus/value-probe]', laudusError
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
        error: error instanceof Error ? error.message : 'No fue posible verificar cobertura Laudus.',
      },
      { status: 502 },
    );
  }
}


// Read-only browser QA alias; authorization is identical to POST.
export const GET = POST;
