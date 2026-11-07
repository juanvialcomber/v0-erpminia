export const dynamic = 'force-dynamic';

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { recoverMissingPurchaseInvoices } from '@/lib/integrations/laudus/procurement-sync';
import { getSupabaseServerClient } from '@/lib/supabase-server';

function hasServerRecoveryToken(request: NextRequest) {
  const expected = process.env.MOTIL_LAUDUS_RECOVERY_TOKEN;
  const authorization = request.headers.get('authorization') || '';
  const prefix = 'Bearer ';

  if (!expected || expected.length < 32 || !authorization.startsWith(prefix)) return false;

  const provided = authorization.slice(prefix.length);
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);

  return expectedBuffer.length === providedBuffer.length
    && timingSafeEqual(expectedBuffer, providedBuffer);
}

async function resolveSingleRecoveryOrganization() {
  const db = getSupabaseServerClient();
  const { data, error } = await db
    .from('laudus_missing_purchase_invoice_recovery_candidates_v1')
    .select('organization_id')
    .order('recovery_priority', { ascending: true })
    .limit(500);

  if (error) throw error;

  const organizationIds = [...new Set((data || [])
    .map((row) => String(row.organization_id || '').trim())
    .filter(Boolean))];

  if (organizationIds.length !== 1) {
    throw new Error(
      organizationIds.length === 0
        ? 'No hay organizaciones con facturas pendientes de recuperación.'
        : 'La recuperación server-to-server requiere una única organización candidata.',
    );
  }

  return { db, organizationId: organizationIds[0] };
}

export async function POST(request: NextRequest) {
  const serverAuthorized = hasServerRecoveryToken(request);

  let organizationId: string;
  let db: ReturnType<typeof getSupabaseServerClient>;
  let authorizationMode: 'server' | 'user';

  if (serverAuthorized) {
    const serverContext = await resolveSingleRecoveryOrganization();
    organizationId = serverContext.organizationId;
    db = serverContext.db;
    authorizationMode = 'server';
  } else {
    const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
    if (!access.authorized) return access.response;
    if (!access.canWrite) {
      return NextResponse.json({ error: 'No tienes permiso para recuperar facturas.' }, { status: 403 });
    }

    const context = await getOrganizationContext(request);
    if (!context.ok) return context.response;

    organizationId = context.organizationId;
    db = context.supabase as ReturnType<typeof getSupabaseServerClient>;
    authorizationMode = 'user';
  }

  try {
    const result = await withLaudusApiUsageTracking(
      organizationId,
      () => recoverMissingPurchaseInvoices(organizationId, db),
    );

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      authorizationMode,
      result,
      policy: {
        maxPerRun: 12,
        minimumApiReserve: 200,
        laudusWriteBack: false,
        canonicalMutationExecuted: false,
        organizationFromRequest: false,
        source: 'Laudus',
      },
    });
  } catch (error) {
    console.error('[laudus/missing-invoices-recovery]', {
      authorizationMode,
      organizationId,
      message: error instanceof Error ? error.message : 'unknown',
    });

    return NextResponse.json(
      { error: 'No fue posible recuperar el lote de facturas faltantes.' },
      { status: 500 },
    );
  }
}
