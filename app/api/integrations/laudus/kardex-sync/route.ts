export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { getLaudus } from '@/lib/integrations/laudus/client';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';

function rowsFrom(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data','items','results','rows']) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    }
  }
  return [];
}

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'La consulta de kardex Laudus requiere permisos de administración.' }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => ({}));
  const productId = String(body?.productId || '').trim();
  if (!/^[0-9]{1,18}$/.test(productId)) {
    return NextResponse.json({ error: 'productId Laudus inválido.' }, { status: 400 });
  }

  try {
    const payload = await withLaudusApiUsageTracking(context.organizationId, () =>
      getLaudus(`/production/products/${encodeURIComponent(productId)}/kardex`),
    );
    const rows = rowsFrom(payload);
    if (rows.length > 500) {
      return NextResponse.json({ error: 'El kardex excede el límite seguro de 500 movimientos.' }, { status: 409 });
    }

    const db = getSupabaseServerClient();
    const { data, error } = await db.rpc('motil_ingest_laudus_product_kardex', {
      p_organization_id: context.organizationId,
      p_product_external_id: productId,
      p_rows: rows,
    });
    if (error) throw new Error('No fue posible guardar el kardex Laudus.');

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      productId,
      movements: rows.length,
      persisted: true,
      stagingOnly: true,
      canonicalMutated: false,
      laudusMutated: false,
      result: data || {},
    });
  } catch (error) {
    console.error('[laudus/kardex-sync]', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ error: 'No fue posible consultar el kardex Laudus.' }, { status: 502 });
  }
}
