export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { readLaudusFixedAssetEconomics } from '@/lib/integrations/laudus/fixed-asset-economics';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const review = await context.supabase.rpc('motil_laudus_fixed_asset_review_queue', {
      p_organization_id: context.organizationId,
      p_limit: 1000,
    });
    if (review.error) throw review.error;

    const payload = (review.data || {}) as {
      queue?: Array<Record<string, unknown>>;
    };
    const queue = Array.isArray(payload.queue) ? payload.queue : [];
    const strong = queue
      .filter((row) =>
        ['strong_identifier_candidate', 'strong_candidate'].includes(String(row.evidence_level || '')),
      )
      .slice(0, 6)
      .map((row) => ({
        laudusExternalId: String(row.laudus_external_id || ''),
        canonicalAssetId: row.canonical_asset_id ? String(row.canonical_asset_id) : null,
        canonicalAssetCode: row.canonical_asset_code ? String(row.canonical_asset_code) : null,
        canonicalAssetName: row.canonical_asset_name ? String(row.canonical_asset_name) : null,
        evidenceLevel: String(row.evidence_level || ''),
        exactPlateSupport: Boolean(row.exact_plate_support),
        exactSerialSupport: Boolean(row.exact_serial_support),
      }));

    const economics = await readLaudusFixedAssetEconomics(strong);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      organizationId: context.organizationId,
      ...economics,
    });
  } catch (error) {
    console.error('[laudus/fixed-asset-economics]', error);
    return NextResponse.json(
      { error: 'No fue posible consultar la economía de activos fijos Laudus.' },
      { status: 500 },
    );
  }
}
