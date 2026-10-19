export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const OPEN_WORK_ORDER_STATES = ['open', 'assigned', 'pending', 'planned', 'in_progress', 'in-progress', 'paused'];

function asText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priorityRank(priority: unknown) {
  const text = String(priority ?? '').toUpperCase();
  if (text.startsWith('P1')) return 1;
  if (text.startsWith('P2')) return 2;
  if (text.startsWith('P3')) return 3;
  if (text.startsWith('P4')) return 4;
  return 9;
}

function ageDays(importedAt: string | null) {
  if (!importedAt) return null;
  const timestamp = Date.parse(importedAt);
  if (Number.isNaN(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [sourceResult, planningResult, workOrdersResult] = await Promise.all([
      context.supabase
        .from('planning_maintenance_source_imports')
        .select('id,source_file,source_owner,source_role,source_sheet,imported_at,status,notes')
        .eq('organization_id', context.organizationId)
        .order('imported_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from('planning_maintenance_priority_v1')
        .select('source_row_id,canonical_asset_id,asset_code,asset_name,mine_raw,meter_unit,current_reading,next_due_meter,remaining_meter,priority,recommended_action,scheduled_date,programming_status_raw,responsible_raw,parts_status_raw,observations,match_method,match_score,source_file,imported_at')
        .eq('organization_id', context.organizationId)
        .order('total_score', { ascending: false, nullsFirst: false })
        .order('asset_name', { ascending: true })
        .limit(2000),
      context.supabase
        .from('maintenance_work_orders')
        .select('id,work_order_number,canonical_asset_id,status,priority,scheduled_date,assigned_to_name,updated_at')
        .eq('organization_id', context.organizationId)
        .in('status', OPEN_WORK_ORDER_STATES)
        .order('updated_at', { ascending: false })
        .limit(1000),
    ]);

    const error = sourceResult.error || planningResult.error || workOrdersResult.error;
    if (error) throw error;

    const openWorkOrdersByAsset = new Map<string, any[]>();
    for (const row of workOrdersResult.data || []) {
      const assetId = asText(row.canonical_asset_id);
      if (!assetId) continue;
      const list = openWorkOrdersByAsset.get(assetId) || [];
      list.push(row);
      openWorkOrdersByAsset.set(assetId, list);
    }

    const rows = (planningResult.data || []).map((row: any) => {
      const assetId = asText(row.canonical_asset_id);
      const openWorkOrders = assetId ? openWorkOrdersByAsset.get(assetId) || [] : [];
      const primaryWorkOrder = openWorkOrders[0] || null;
      return {
        id: asText(row.source_row_id) || asText(row.canonical_asset_id) || `${row.asset_name || 'asset'}-${row.mine_raw || 'site'}`,
        canonicalAssetId: assetId,
        assetCode: asText(row.asset_code),
        assetName: asText(row.asset_name) || 'Equipo sin nombre',
        site: asText(row.mine_raw) || 'Sin faena',
        meterUnit: asText(row.meter_unit),
        currentReading: asNumber(row.current_reading),
        nextDueMeter: asNumber(row.next_due_meter),
        remainingMeter: asNumber(row.remaining_meter),
        priority: asText(row.priority) || 'Sin prioridad',
        priorityRank: priorityRank(row.priority),
        recommendedAction: asText(row.recommended_action),
        scheduledDate: asText(row.scheduled_date),
        programmingStatus: asText(row.programming_status_raw) || 'Sin estado',
        responsible: asText(row.responsible_raw),
        partsStatus: asText(row.parts_status_raw) || 'Sin estado',
        observations: asText(row.observations),
        matchMethod: asText(row.match_method),
        matchScore: asNumber(row.match_score),
        sourceFile: asText(row.source_file),
        importedAt: asText(row.imported_at),
        openWorkOrders: openWorkOrders.length,
        workOrderNumber: asText(primaryWorkOrder?.work_order_number),
        workOrderStatus: asText(primaryWorkOrder?.status),
        workOrderPriority: asText(primaryWorkOrder?.priority),
        workOrderScheduledDate: asText(primaryWorkOrder?.scheduled_date),
        workOrderAssignee: asText(primaryWorkOrder?.assigned_to_name),
      };
    });

    const source = sourceResult.data || null;
    const importedAt = asText(source?.imported_at) || (rows[0]?.importedAt ?? null);
    const sourceAgeDays = ageDays(importedAt);
    const sites = Array.from(new Set(rows.map((row) => row.site))).sort((a, b) => a.localeCompare(b, 'es'));

    const p1 = rows.filter((row) => row.priorityRank === 1).length;
    const p2 = rows.filter((row) => row.priorityRank === 2).length;
    const scheduled = rows.filter((row) => /programado/i.test(row.programmingStatus) && !/no programado/i.test(row.programmingStatus)).length;
    const partsPending = rows.filter((row) => /pendiente|faltante|solicitud|comprar/i.test(row.partsStatus)).length;
    const unmatched = rows.filter((row) => !row.canonicalAssetId).length;
    const openWorkOrders = Array.from(openWorkOrdersByAsset.values()).reduce((sum, list) => sum + list.length, 0);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: {
        file: asText(source?.source_file) || rows[0]?.sourceFile || null,
        owner: asText(source?.source_owner),
        role: asText(source?.source_role),
        sheet: asText(source?.source_sheet),
        importedAt,
        status: asText(source?.status),
        notes: asText(source?.notes),
        ageDays: sourceAgeDays,
        freshness: sourceAgeDays == null ? 'unknown' : sourceAgeDays <= 1 ? 'fresh' : sourceAgeDays <= 7 ? 'aging' : 'stale',
      },
      summary: {
        total: rows.length,
        p1,
        p2,
        urgent: p1 + p2,
        scheduled,
        partsPending,
        openWorkOrders,
        unmatched,
      },
      sites,
      rows,
      mode: 'read_only',
      refreshSeconds: 60,
    }, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo cargar la Torre de Control' },
      { status: 500 },
    );
  }
}
