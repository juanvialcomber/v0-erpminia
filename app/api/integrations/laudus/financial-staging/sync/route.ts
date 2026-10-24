export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;

  if (!access.admin) {
    return NextResponse.json(
      { error: 'La actualización financiera Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  const db = getSupabaseServerClient();
  const { data, error } = await db.rpc('motil_refresh_laudus_financial_staging', {
    p_organization_id: access.organizationId,
  });

  if (error) {
    console.error('[laudus/financial-staging/sync]', error.message);
    return NextResponse.json(
      {
        status: 'partial',
        source: 'Laudus',
        mode: 'read_only',
        canonicalMutated: false,
        laudusMutated: false,
        error: 'No fue posible refrescar el staging financiero Laudus.',
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    status: 'ok',
    source: 'Laudus',
    mode: 'read_only',
    result: data,
    canonicalMutated: false,
    laudusMutated: false,
  });
}
