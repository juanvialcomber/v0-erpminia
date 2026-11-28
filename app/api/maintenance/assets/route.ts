export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type AssetRow = {
  id: string;
  asset_code: string | null;
  name: string | null;
  asset_type: string | null;
  location: string | null;
  operational_status: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  criticality: string | null;
  mtbf_hours: number | string | null;
  acquisition_cost: number | string | null;
};

function mapAsset(asset: AssetRow) {
  return {
    id: asset.id,
    assetCode: asset.asset_code,
    assetName: asset.name,
    assetType: asset.asset_type,
    location: asset.location,
    status: asset.operational_status,
    manufacturer: asset.manufacturer,
    model: asset.model,
    serialNumber: asset.serial_number,
    criticality: asset.criticality,
    mtbfHours: asset.mtbf_hours !== null && asset.mtbf_hours !== undefined ? Number(asset.mtbf_hours) : null,
    acquisitionCost: asset.acquisition_cost !== null && asset.acquisition_cost !== undefined ? Number(asset.acquisition_cost) : null,
  };
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const searchParams = new URL(request.url).searchParams;
    const status = searchParams.get('status');
    const criticality = searchParams.get('criticality');
    const assetType = searchParams.get('asset_type');

    let query = context.supabase
      .from('canonical_assets_current')
      .select('id,asset_code,name,asset_type,location,operational_status,manufacturer,model,serial_number,criticality,mtbf_hours,acquisition_cost')
      .eq('organization_id', context.organizationId)
      .eq('is_active', true)
      .order('criticality', { ascending: false, nullsFirst: false })
      .order('name', { ascending: true });

    if (status) {
      query = query.eq('operational_status', status);
    }

    if (criticality) {
      query = query.eq('criticality', criticality);
    }

    if (assetType) {
      query = query.eq('asset_type', assetType);
    }

    const { data, error } = await query;
    if (error) throw error;

    const assets = Array.isArray(data) ? (data as AssetRow[]) : [];

    return NextResponse.json({
      assets: assets.map(mapAsset),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar los activos canónicos';
    return NextResponse.json({ assets: [], error: message }, { status: 500 });
  }
}
