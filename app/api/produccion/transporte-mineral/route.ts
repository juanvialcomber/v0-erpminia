export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type MovementRow = {
  id: string;
  movement_number: string | null;
  movement_date: string;
  movement_time: string | null;
  mine_name_raw: string | null;
  sector_name_raw: string | null;
  carrier_name_raw: string | null;
  driver_name_raw: string | null;
  vehicle_plate_raw: string | null;
  normalized_metric_tons: number | null;
  normalization_status: string | null;
  validation_status: string | null;
  source_file: string | null;
  source_sheet: string | null;
  source_row: number | null;
};

function key(value: string | null | undefined, fallback = 'Sin identificar') {
  const normalized = value?.trim();
  return normalized || fallback;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.PROD_OPERACIONES);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const [latest, stockDoc] = await Promise.all([
    context.supabase
      .from('production_material_movements')
      .select('movement_date')
      .eq('organization_id', context.organizationId)
      .order('movement_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    context.supabase
      .from('production_source_documents')
      .select('source_file,source_file_sha256,period_end')
      .eq('organization_id', context.organizationId)
      .eq('canonical_role','canonical')
      .ilike('source_file','Nueva stock %.xlsx')
      .order('period_end',{ascending:false})
      .limit(1)
      .maybeSingle(),
  ]);

  if (latest.error || stockDoc.error) return NextResponse.json({ error: latest.error?.message || stockDoc.error?.message }, { status: 500 });

  const sourceReportedResult = stockDoc.data
    ? await context.supabase
        .from('production_source_normalized_records')
        .select('normalized_values')
        .eq('organization_id',context.organizationId)
        .eq('source_file',stockDoc.data.source_file)
        .eq('source_file_sha256',stockDoc.data.source_file_sha256)
        .eq('record_type','stock_week_transport_total')
        .eq('semantic_status','source_reported')
        .maybeSingle()
    : { data:null, error:null };
  if (sourceReportedResult.error) return NextResponse.json({ error: sourceReportedResult.error.message }, { status:500 });
  const reportedValues=(sourceReportedResult.data?.normalized_values||{}) as Record<string,unknown>;
  const reportedValue=typeof reportedValues.value==='number'&&Number.isFinite(reportedValues.value)?reportedValues.value:null;
  const reported={
    source:stockDoc.data?.source_file||null,
    cutoff:stockDoc.data?.period_end||null,
    tons:reportedValue,
    daily:(reportedValues.daily_actual_through_cutoff||{}) as Record<string,number>,
  };

  if (!latest.data?.movement_date) return NextResponse.json({ period: null, reported, rows: [], daily: [], routes: [], carriers: [], vehicles: [] });

  const through = latest.data.movement_date;
  const date = new Date(`${through}T12:00:00Z`);
  const periodStart = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`;

  const movements = await context.supabase
    .from('production_material_movements')
    .select('id,movement_number,movement_date,movement_time,mine_name_raw,sector_name_raw,carrier_name_raw,driver_name_raw,vehicle_plate_raw,normalized_metric_tons,normalization_status,validation_status,source_file,source_sheet,source_row')
    .eq('organization_id', context.organizationId)
    .gte('movement_date', periodStart)
    .lte('movement_date', through)
    .order('movement_date', { ascending: false })
    .order('movement_time', { ascending: false });

  if (movements.error) return NextResponse.json({ error: movements.error.message }, { status: 500 });
  const rows = (movements.data || []) as MovementRow[];

  const dailyMap = new Map<string, { date: string; rows: number; tons: number }>();
  const routeMap = new Map<string, { mine: string; sector: string; rows: number; tons: number }>();
  const carrierMap = new Map<string, { carrier: string; rows: number; tons: number; vehicles: Set<string> }>();
  const vehicleMap = new Map<string, { plate: string; carrier: string; rows: number; tons: number }>();

  for (const row of rows) {
    const tons = Number(row.normalized_metric_tons || 0);
    const day = dailyMap.get(row.movement_date) || { date: row.movement_date, rows: 0, tons: 0 };
    day.rows += 1; day.tons += tons; dailyMap.set(row.movement_date, day);

    const mine = key(row.mine_name_raw);
    const sector = key(row.sector_name_raw);
    const routeKey = `${mine}|||${sector}`;
    const route = routeMap.get(routeKey) || { mine, sector, rows: 0, tons: 0 };
    route.rows += 1; route.tons += tons; routeMap.set(routeKey, route);

    const carrierName = key(row.carrier_name_raw);
    const carrier = carrierMap.get(carrierName) || { carrier: carrierName, rows: 0, tons: 0, vehicles: new Set<string>() };
    carrier.rows += 1; carrier.tons += tons;
    if (row.vehicle_plate_raw?.trim()) carrier.vehicles.add(row.vehicle_plate_raw.trim());
    carrierMap.set(carrierName, carrier);

    const plate = key(row.vehicle_plate_raw, 'Sin patente');
    const vehicle = vehicleMap.get(plate) || { plate, carrier: carrierName, rows: 0, tons: 0 };
    vehicle.rows += 1; vehicle.tons += tons; vehicleMap.set(plate, vehicle);
  }

  const totalTons = rows.reduce((sum, row) => sum + Number(row.normalized_metric_tons || 0), 0);
  const validRows = rows.filter((row) => row.validation_status === 'valid' || row.validation_status === 'validated').length;
  const normalizedRows = rows.filter((row) => row.normalization_status === 'normalized' || Number(row.normalized_metric_tons || 0) > 0).length;

  return NextResponse.json({
    reported,
    period: {
      start: periodStart,
      through,
      movements: rows.length,
      tons: totalTons,
      avgTonsPerMovement: rows.length ? totalTons / rows.length : 0,
      mines: new Set(rows.map((row) => key(row.mine_name_raw))).size,
      sectors: new Set(rows.map((row) => key(row.sector_name_raw))).size,
      carriers: new Set(rows.map((row) => key(row.carrier_name_raw))).size,
      vehicles: new Set(rows.map((row) => key(row.vehicle_plate_raw, 'Sin patente'))).size,
      normalizedCoveragePct: rows.length ? (normalizedRows / rows.length) * 100 : 0,
      validatedCoveragePct: rows.length ? (validRows / rows.length) * 100 : 0,
    },
    daily: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
    routes: Array.from(routeMap.values()).sort((a, b) => b.tons - a.tons).slice(0, 20),
    carriers: Array.from(carrierMap.values()).map((item) => ({ carrier: item.carrier, rows: item.rows, tons: item.tons, vehicles: item.vehicles.size })).sort((a, b) => b.tons - a.tons).slice(0, 20),
    vehicles: Array.from(vehicleMap.values()).sort((a, b) => b.tons - a.tons).slice(0, 25),
    rows: rows.slice(0, 80),
    lineage: {
      table: 'production_material_movements',
      note: 'Los nombres de mina, sector, transportista y patente se muestran tal como vienen de la fuente canónica; no se infieren equivalencias no reconciliadas.',
    },
  });
}
