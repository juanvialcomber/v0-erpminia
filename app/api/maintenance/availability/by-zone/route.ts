export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

type AssetRow = {
  id: string;
  asset_code: string | null;
  asset_name: string | null;
  asset_type: string | null;
  location: string | null;
  status: string | null;
  mtbf_hours: number | string | null;
  work_orders: Array<{
    id: string;
    status: string;
    work_order_number: string | null;
    title: string | null;
  }> | null;
  cost_center_id: string | null;
  cost_center: {
    code: string | null;
    name: string | null;
  } | null;
};

type AssetByZone = {
  zone: string;
  assets: Array<{
    id: string;
    assetCode: string;
    assetName: string;
    assetType: string;
    location: string;
    status: 'operational' | 'maintenance' | 'critical';
    mtbfHours: number;
    currentWorkOrder: {
      workOrderNumber: string;
      title: string;
    } | null;
  }>;
  summary: {
    total: number;
    operational: number;
    maintenance: number;
    critical: number;
    availabilityPercentage: number | null;
    operationalSharePercentage: number | null;
    evidenceStatus: string;
  };
};

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { data: assets, error } = await context.supabase
      .from('maintenance_assets')
      .select(
        'id, asset_code, asset_name, asset_type, location, status, mtbf_hours, cost_center_id, cost_center:cost_centers(code, name), work_orders:maintenance_work_orders(id, status, work_order_number, title)'
      )
      .eq('organization_id', context.organizationId)
      .order('location', { ascending: true });

    // Fallback to cost_centers when maintenance_assets is empty or errors
    let assetRows: AssetRow[] = (!error && Array.isArray(assets) && assets.length > 0)
      ? (assets as unknown as AssetRow[])
      : [];

    if (assetRows.length === 0) {
      const { data: costCenters } = await context.supabase
        .from('cost_centers')
        .select('id, code, name, status')
        .eq('organization_id', context.organizationId)
        .order('name', { ascending: true });

      assetRows = (costCenters || []).map((cc) => ({
        id: cc.id,
        asset_code: cc.code ?? null,
        asset_name: cc.name ?? null,
        asset_type: null,
        location: null,
        status: cc.status ?? 'activo',
        mtbf_hours: null,
        work_orders: null,
        cost_center_id: null,
        cost_center: { code: cc.code ?? null, name: cc.name ?? null },
      }));
    }

    const statusMap: Record<string, 'operational' | 'maintenance' | 'critical'> = {
      operational: 'operational',
      available: 'operational',
      activo: 'operational',
      maintenance: 'maintenance',
      mantenimiento: 'maintenance',
      en_mantenimiento: 'maintenance',
      in_progress: 'maintenance',
      critical: 'critical',
      critico: 'critical',
      down: 'critical',
      fault: 'critical',
    };

    // Group by zone (cost_center or location)
    const byZone = assetRows.reduce(
      (acc, asset) => {
        const zone = asset.cost_center?.name || asset.location || 'Sin zona';
        if (!acc[zone]) {
          acc[zone] = [];
        }

        const currentStatus = asset.work_orders?.some((wo) => wo.status === 'in_progress')
          ? 'maintenance'
          : statusMap[String(asset.status || '').toLowerCase()] || 'operational';

        const inProgressWO = asset.work_orders?.find((wo) => wo.status === 'in_progress');

        acc[zone].push({
          id: asset.id,
          asset_code: asset.asset_code || 'N/A',
          asset_name: asset.asset_name || 'Equipo sin nombre',
          asset_type: asset.asset_type || 'N/A',
          location: asset.location || 'N/A',
          status: currentStatus,
          mtbf_hours: Number(asset.mtbf_hours || 0),
          work_orders: inProgressWO
            ? [{
                id: inProgressWO.id,
                status: inProgressWO.status,
                work_order_number: inProgressWO.work_order_number,
                title: inProgressWO.title,
              }]
            : null,
          cost_center_id: asset.cost_center_id,
          cost_center: asset.cost_center as unknown as { code: string | null; name: string | null } | null,
        });

        return acc;
      },
      {} as Record<string, typeof assetRows>
    );

    // Compute summary per zone
    const zoneData: AssetByZone[] = Object.entries(byZone)
      .map(([zone, zoneAssets]) => {
        const statusCounts = (zoneAssets as any[]).reduce(
          (acc, asset) => {
            const status = asset.status || 'operational';
            acc[status as keyof typeof acc]++;
            return acc;
          },
          { operational: 0, maintenance: 0, critical: 0 }
        );

        const total = zoneAssets.length;
        const operationalShare = total > 0 ? Math.round((statusCounts.operational / total) * 100) : null;

        // Convert asset rows to proper format
        const formattedAssets = (zoneAssets as any[]).map((asset) => {
          const inProgressWO = asset.work_orders?.find((wo: any) => wo.status === 'in_progress');
          return {
            id: asset.id,
            assetCode: asset.asset_code || 'N/A',
            assetName: asset.asset_name || 'Equipo sin nombre',
            assetType: asset.asset_type || 'N/A',
            location: asset.location || 'N/A',
            status: asset.status || 'operational',
            mtbfHours: Number(asset.mtbf_hours || 0),
            currentWorkOrder: inProgressWO
              ? {
                  workOrderNumber: inProgressWO.work_order_number || 'N/A',
                  title: inProgressWO.title || 'Sin título',
                }
              : null,
          };
        });

        return {
          zone,
          assets: formattedAssets,
          summary: {
            total,
            operational: statusCounts.operational,
            maintenance: statusCounts.maintenance,
            critical: statusCounts.critical,
            availabilityPercentage: null,
            operationalSharePercentage: operationalShare,
            evidenceStatus: 'status_snapshot_not_availability',
          },
        };
      })
      .sort((a, b) => (b.summary.operationalSharePercentage ?? -1) - (a.summary.operationalSharePercentage ?? -1));

    return NextResponse.json(
      {
        byZone: zoneData,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Error al obtener disponibilidad por zona';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
