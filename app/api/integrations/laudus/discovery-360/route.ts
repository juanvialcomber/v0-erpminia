export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import {
  discoverLaudusCapabilities,
  loadLaudusOpenApiDocument,
  summarizeLaudusCapabilities,
} from '@/lib/integrations/laudus/openapi-discovery';

export async function GET(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'El descubrimiento Laudus requiere permisos de administración.' }, { status: 403 });
  }

  try {
    const discovery = await loadLaudusOpenApiDocument();
    if (!discovery.document) {
      return NextResponse.json({
        status: 'spec_unavailable',
        persisted: false,
        uiStatus: discovery.uiStatus,
        specUrl: null,
        domains: {},
      }, { status: 502 });
    }

    const capabilities = discoverLaudusCapabilities(discovery.document);
    return NextResponse.json({
      status: 'ok',
      persisted: false,
      specUrl: discovery.specUrl,
      capabilityCount: capabilities.length,
      domains: summarizeLaudusCapabilities(capabilities),
    });
  } catch (error) {
    console.error('[laudus/discovery-360]', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({
      status: 'failed',
      persisted: false,
      error: 'No fue posible leer el catálogo público de Laudus.',
    }, { status: 502 });
  }
}
