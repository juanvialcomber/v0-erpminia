export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

function toIso(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toDateOnly(value?: string | null) {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

type WorkOrderRow = {
  id: string;
  work_order_number: string | null;
  canonical_asset_id: string | null;
  title: string | null;
  work_type: string | null;
  status: string | null;
  priority: string | null;
  assigned_to_name: string | null;
  scheduled_date: string | null;
  start_date: string | null;
  completion_date: string | null;
  closed_at: string | null;
  actual_duration_hours: number | string | null;
  root_cause: string | null;
  preventive_actions: string | null;
  created_by: string | null;
  created_at: string | null;
};

type AssetRow = {
  id: string;
  asset_code: string | null;
  name: string | null;
  asset_type: string | null;
  location: string | null;
  criticality: string | null;
};

type CostSnapshotRow = {
  work_order_id: string;
  closure_sequence: number | string | null;
  parts_cost: number | string | null;
  labor_cost: number | string | null;
  total_cost: number | string | null;
  closed_at: string | null;
};

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const searchParams = request.nextUrl.searchParams;
    const assetId = searchParams.get('assetId')?.trim() || null;
    const requestedLimit = Number(searchParams.get('limit') || '200');
    const limit = Number.isFinite(requestedLimit) ? Math.min(1000, Math.max(1, Math.floor(requestedLimit))) : 200;

    let query = context.supabase
      .from('maintenance_work_orders')
      .select('id,work_order_number,canonical_asset_id,title,work_type,status,priority,assigned_to_name,scheduled_date,start_date,completion_date,closed_at,actual_duration_hours,root_cause,preventive_actions,created_by,created_at')
      .eq('organization_id', context.organizationId)
      .in('status', ['completed', 'closed'])
      .order('closed_at', { ascending: false, nullsFirst: false })
      .order('completion_date', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (assetId) query = query.eq('canonical_asset_id', assetId);

    const { data: workOrders, error: workOrdersError } = await query;
    if (workOrdersError) throw workOrdersError;

    const rows = (workOrders || []) as WorkOrderRow[];
    const assetIds = [...new Set(rows.map((row) => row.canonical_asset_id).filter((id): id is string => Boolean(id)))];
    const workOrderIds = rows.map((row) => row.id);

    const [assetsResult, snapshotsResult] = await Promise.all([
      assetIds.length
        ? context.supabase
            .from('canonical_assets_current')
            .select('id,asset_code,name,asset_type,location,criticality')
            .eq('organization_id', context.organizationId)
            .in('id', assetIds)
        : Promise.resolve({ data: [], error: null }),
      workOrderIds.length
        ? context.supabase
            .from('work_order_closure_cost_snapshots')
            .select('work_order_id,closure_sequence,parts_cost,labor_cost,total_cost,closed_at')
            .eq('organization_id', context.organizationId)
            .in('work_order_id', workOrderIds)
            .order('closure_sequence', { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (assetsResult.error) throw assetsResult.error;
    if (snapshotsResult.error) throw snapshotsResult.error;

    const assetById = new Map(((assetsResult.data || []) as AssetRow[]).map((asset) => [asset.id, asset]));
    const snapshotByWorkOrder = new Map<string, CostSnapshotRow>();
    for (const snapshot of (snapshotsResult.data || []) as CostSnapshotRow[]) {
      if (!snapshotByWorkOrder.has(snapshot.work_order_id)) snapshotByWorkOrder.set(snapshot.work_order_id, snapshot);
    }

    const entries = rows.map((row) => {
      const asset = row.canonical_asset_id ? assetById.get(row.canonical_asset_id) : null;
      const snapshot = snapshotByWorkOrder.get(row.id) || null;
      const closedAt = row.closed_at || row.completion_date || snapshot?.closed_at || row.created_at;
      const notes = [
        row.root_cause ? `Causa: ${row.root_cause}` : null,
        row.preventive_actions ? `Prevención: ${row.preventive_actions}` : null,
      ].filter(Boolean).join(' · ') || null;

      return {
        id: `work-order:${row.id}`,
        workOrderId: row.id,
        assetId: row.canonical_asset_id,
        assetName: asset?.name || 'Sin activo canónico',
        assetCode: asset?.asset_code || null,
        assetType: asset?.asset_type || null,
        location: asset?.location || null,
        criticality: asset?.criticality || null,
        maintenanceType: row.work_type || null,
        performedByName: row.assigned_to_name || null,
        startTime: toIso(row.start_date),
        endTime: toIso(row.closed_at || row.completion_date),
        partsReplaced: null,
        partsCost: Number(snapshot?.parts_cost || 0),
        laborHours: Number(row.actual_duration_hours || 0),
        laborCost: Number(snapshot?.labor_cost || 0),
        notes,
        createdAt: toIso(closedAt),
        createdDate: toDateOnly(closedAt),
        recordScope: row.created_by ? 'operational' : 'historical',
        source: 'maintenance_work_orders',
        workOrder: {
          workOrderNumber: row.work_order_number || null,
          title: row.title || null,
          status: row.status || null,
          priority: row.priority || null,
          scheduledDate: toDateOnly(row.scheduled_date),
        },
      };
    });

    return NextResponse.json({
      entries,
      assets: [...assetById.values()],
      summary: {
        total: entries.length,
        assets: new Set(entries.map((entry) => entry.assetId).filter(Boolean)).size,
      },
      canonical: true,
      source: 'maintenance_work_orders',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la bitácora';
    return NextResponse.json({ entries: [], assets: [], summary: { total: 0, assets: 0 }, error: message }, { status: 500 });
  }
}
