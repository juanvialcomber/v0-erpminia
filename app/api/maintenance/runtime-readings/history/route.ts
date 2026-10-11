export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

// Read-only supervisor audit feed. The underlying measurements are append-only.
export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_GERENCIAL);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  try {
    const { data, error } = await context.supabase
      .from('asset_runtime_readings')
      .select('id,canonical_asset_id,meter_hours,recorded_at,created_at,source_type,source_reference,recorded_by')
      .eq('organization_id', context.organizationId)
      .order('recorded_at', { ascending: false }).limit(100);
    if (error) throw error;
    const assetIds = [...new Set((data || []).map((row) => row.canonical_asset_id).filter(Boolean))];
    const { data: assets, error: assetsError } = assetIds.length
      ? await context.supabase.from('maintenance_canonical_assets_v1')
        .select('id,asset_code,name').eq('organization_id', context.organizationId).in('id', assetIds)
      : { data: [], error: null };
    if (assetsError) throw assetsError;
    const assetNames = new Map((assets || []).map((asset) => [asset.id,
      [asset.asset_code, asset.name].filter(Boolean).join(' · ') || 'Equipo sin nombre']));
    const actorIds = [...new Set((data || []).map((row) => row.recorded_by).filter(Boolean))];
    const { data: profiles, error: profileError } = actorIds.length
      ? await context.supabase.from('profiles').select('id,email').eq('organization_id',context.organizationId).in('id', actorIds)
      : { data: [], error: null };
    if (profileError) throw profileError;
    const actorNames = new Map((profiles || []).map((p) => [p.id, p.email]));
    const rows = await Promise.all((data || []).map(async (reading) => {
      const reference = String(reading.source_reference || '');
      const photoPath = reference.startsWith('storage:maintenance-work-order-evidence/') ? reference.slice('storage:maintenance-work-order-evidence/'.length) : null;
      const photo = photoPath ? await context.supabase.storage.from('maintenance-work-order-evidence').createSignedUrl(photoPath, 600) : null;
      return { ...reading, asset_label: assetNames.get(reading.canonical_asset_id) || 'Equipo registrado',
        recorded_by_label: actorNames.get(reading.recorded_by) || 'Usuario registrado',
        photo_url: photo?.data?.signedUrl || null };
    }));
    return NextResponse.json({ rows, source: 'asset_runtime_readings', readOnly: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo consultar el historial.' }, { status: 500 });
  }
}
