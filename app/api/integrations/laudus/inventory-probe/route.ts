export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import {
  getLaudusConfigurationState,
  LaudusApiError,
  runLaudusInventoryReadOnlyProbe,
} from '@/lib/integrations/laudus/client';

export async function GET() {
  const isExpectedPreview =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'feat/laudus-inventory-discovery-20261023';

  if (!isExpectedPreview) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const configuration = getLaudusConfigurationState();
  if (!configuration.configured) {
    return NextResponse.json({
      status: 'pending_configuration',
      calls: 0,
      persisted: false,
      missing: configuration.missing,
    }, { status: 503 });
  }

  try {
    const result = await runLaudusInventoryReadOnlyProbe(1);
    return NextResponse.json({
      status: 'ok',
      scope: 'inventory-shape-only',
      ...result,
    });
  } catch (error) {
    const laudusError = error instanceof LaudusApiError ? error : null;
    return NextResponse.json({
      status: 'failed',
      persisted: false,
      stage: laudusError?.path || null,
      upstreamStatus: laudusError?.status || null,
      upstreamCode: laudusError?.upstreamCode || null,
      error: error instanceof Error ? error.message : 'No fue posible validar inventario Laudus.',
    }, { status: 502 });
  }
}
