export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type ReportedRow = {
  source_id: string;
  mine: string;
  reported_date: string;
  source_file: string;
  gmail_message_id: string | null;
  received_at: string | null;
  row_id: string;
  source_row: number;
  canonical_asset_id: string | null;
  asset_code: string | null;
  asset_name: string | null;
  asset_type: string | null;
  category: string | null;
  location: string | null;
  criticality: string | null;
  raw_asset_name: string;
  raw_status: string;
  normalized_state: string;
  availability_classification: string;
  availability_numerator: number | null;
  availability_denominator: number;
  downtime_kind: string | null;
  meter_unit: string | null;
  meter_value: number | string | null;
  detail: string | null;
  planning_observation: string | null;
  reconciliation_status: string;
  reconciliation_method: string | null;
  review_reason: string | null;
  validation_status: string;
};

function normalized(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function familyForRow(row: ReportedRow) {
  const category = normalized(row.category);
  const type = normalized(row.asset_type);
  const name = normalized(row.asset_name || row.raw_asset_name);

  const direct = category && !['VEHICLE', 'EQUIPMENT'].includes(category) ? category : '';
  if (direct) {
    if (direct.includes('CAMIONETA') || direct.includes('VEHICULOS LIVIANOS')) return { label: 'Camionetas', source: 'canonical_category' };
    if (direct.includes('GENERADOR')) return { label: 'Generadores', source: 'canonical_category' };
    if (direct.includes('COMPRESOR')) return { label: 'Compresores', source: 'canonical_category' };
    if (direct.includes('CARGADORES DE BAJO PERFIL')) return { label: 'Scoops', source: 'canonical_category' };
    if (direct.includes('CARGADORES FRONTALES')) return { label: 'Cargadores', source: 'canonical_category' };
    if (direct.includes('CAMIONES DE BAJO PERFIL')) return { label: 'Dumpers', source: 'canonical_category' };
    if (direct.includes('CAMIONES')) return { label: 'Camiones', source: 'canonical_category' };
    if (direct.includes('PERFORACION') || direct.includes('SONDAJE')) return { label: 'Perforación', source: 'canonical_category' };
    if (direct.includes('MANIPULADORES')) return { label: 'Manipuladores', source: 'canonical_category' };
    return { label: String(row.category), source: 'canonical_category' };
  }

  if (type === 'DRILL RIG') return { label: 'Perforación', source: 'canonical_asset_type' };
  if (type === 'VEHICLE') return { label: 'Camionetas', source: 'derived_name_v1' };

  if (name.includes('CAMIONETA') || name.includes('HILUX')) return { label: 'Camionetas', source: 'derived_name_v1' };
  if (name.includes('GENERADOR')) return { label: 'Generadores', source: 'derived_name_v1' };
  if (name.includes('COMPRESOR')) return { label: 'Compresores', source: 'derived_name_v1' };
  if (name.includes('SCOOP')) return { label: 'Scoops', source: 'derived_name_v1' };
  if (name.includes('CARGADOR FRONTAL')) return { label: 'Cargadores', source: 'derived_name_v1' };
  if (name.includes('DUMPER')) return { label: 'Dumpers', source: 'derived_name_v1' };
  if (name.includes('JUMBO') || name.includes('DIAMEC') || name.includes('ONRAM') || name.includes('OMRAM') || name.includes('MDS') || name.includes('DTH')) return { label: 'Perforación', source: 'derived_name_v1' };
  if (name.includes('BOMBA')) return { label: 'Bombas', source: 'derived_name_v1' };
  if (name.includes('VENTILADOR')) return { label: 'Ventilación', source: 'derived_name_v1' };
  if (name.includes('MANIPULADOR')) return { label: 'Manipuladores', source: 'derived_name_v1' };
  if (name.includes('CAMION')) return { label: 'Camiones', source: 'derived_name_v1' };
  return { label: 'Otros', source: 'derived_name_v1' };
}

function santiagoDay(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86400000));
}

function dateRange(request: NextRequest) {
  const url = request.nextUrl;
  const explicitFrom = url.searchParams.get('from');
  const explicitTo = url.searchParams.get('to');
  if (explicitFrom && explicitTo) return { from: explicitFrom, to: explicitTo, period: 'custom' };

  const period = url.searchParams.get('period') || '30d';
  const to = santiagoDay();
  if (period === '7d') return { from: santiagoDay(-6), to, period };
  if (period === 'month') return { from: `${to.slice(0, 7)}-01`, to, period };
  return { from: santiagoDay(-29), to, period: '30d' };
}

function pct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((1000 * numerator) / denominator) / 10 : null;
}

function aggregate(rows: Array<ReportedRow & { family: string; familySource: string }>) {
  const totalRows = rows.length;
  const classifiedRows = rows.filter((row) => Number(row.availability_denominator || 0) === 1);
  const availableRows = classifiedRows.filter((row) => Number(row.availability_numerator || 0) === 1);
  const unavailableRows = classifiedRows.length - availableRows.length;
  return {
    sourceRows: totalRows,
    classifiedObservations: classifiedRows.length,
    availableObservations: availableRows.length,
    unavailableObservations: unavailableRows,
    reviewRequired: rows.filter((row) => row.availability_classification === 'review_required' || row.reconciliation_status !== 'matched').length,
    availabilityPercentage: pct(availableRows.length, classifiedRows.length),
    evidenceCoveragePercentage: pct(classifiedRows.length, totalRows),
  };
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const range = dateRange(request);
  const mine = request.nextUrl.searchParams.get('mine') || 'Don Jaime';
  const familyFilter = request.nextUrl.searchParams.get('family');
  const assetId = request.nextUrl.searchParams.get('assetId');

  try {
    let query = context.supabase
      .from('maintenance_reported_availability_daily_v1')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('mine', mine)
      .gte('reported_date', range.from)
      .lte('reported_date', range.to)
      .order('reported_date', { ascending: true })
      .order('source_row', { ascending: true })
      .limit(5000);

    if (assetId) query = query.eq('canonical_asset_id', assetId);

    const { data, error } = await query;
    if (error) {
      const message = String(error.message || '');
      if (message.includes('maintenance_reported_availability_daily_v1') || message.includes('schema cache')) {
        return NextResponse.json({
          status: 'schema_pending',
          mine,
          range,
          summary: null,
          evidence: {
            methodology: 'reported_snapshot_v1',
            note: 'La migración de disponibilidad reportada aún no está aplicada en este entorno.',
          },
          timestamp: new Date().toISOString(),
        });
      }
      throw error;
    }

    const enriched = ((data || []) as ReportedRow[]).map((row) => {
      const family = familyForRow(row);
      return { ...row, family: family.label, familySource: family.source };
    });
    const rows = familyFilter ? enriched.filter((row) => row.family === familyFilter) : enriched;
    const summary = aggregate(rows);
    const reportDates = [...new Set(rows.map((row) => row.reported_date))].sort();
    const latestDate = reportDates.at(-1) || null;

    const daily = reportDates.map((date) => {
      const dayRows = rows.filter((row) => row.reported_date === date);
      return { date, ...aggregate(dayRows) };
    });

    const familyMap = new Map<string, typeof rows>();
    for (const row of rows) {
      familyMap.set(row.family, [...(familyMap.get(row.family) || []), row]);
    }
    const families = [...familyMap.entries()]
      .map(([family, familyRows]) => ({
        family,
        familySource: familyRows.every((row) => row.familySource.startsWith('canonical')) ? 'canonical' : 'mixed_or_derived',
        ...aggregate(familyRows),
      }))
      .sort((a, b) => (a.availabilityPercentage ?? -1) - (b.availabilityPercentage ?? -1));

    const assetMap = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = row.canonical_asset_id || `unresolved:${row.raw_asset_name}`;
      assetMap.set(key, [...(assetMap.get(key) || []), row]);
    }
    const assets = [...assetMap.entries()]
      .map(([key, assetRows]) => {
        const last = [...assetRows].sort((a, b) => b.reported_date.localeCompare(a.reported_date))[0];
        return {
          id: last.canonical_asset_id || key,
          assetCode: last.asset_code,
          assetName: last.asset_name || last.raw_asset_name,
          family: last.family,
          familySource: last.familySource,
          latestDate: last.reported_date,
          latestStatus: last.raw_status,
          latestClassification: last.availability_classification,
          latestDetail: last.detail,
          sourceFile: last.source_file,
          ...aggregate(assetRows),
        };
      })
      .sort((a, b) => (a.availabilityPercentage ?? -1) - (b.availabilityPercentage ?? -1) || String(a.assetName).localeCompare(String(b.assetName)));

    const latestRows = latestDate ? rows.filter((row) => row.reported_date === latestDate) : [];
    const currentUnavailable = latestRows
      .filter((row) => row.availability_classification === 'unavailable')
      .map((row) => ({
        canonicalAssetId: row.canonical_asset_id,
        assetName: row.asset_name || row.raw_asset_name,
        family: row.family,
        status: row.raw_status,
        detail: row.detail,
        sourceFile: row.source_file,
        reportedDate: row.reported_date,
      }));

    const sourceMap = new Map<string, { sourceId: string; reportedDate: string; sourceFile: string; gmailMessageId: string | null; receivedAt: string | null }>();
    for (const row of rows) {
      if (!sourceMap.has(row.source_id)) {
        sourceMap.set(row.source_id, {
          sourceId: row.source_id,
          reportedDate: row.reported_date,
          sourceFile: row.source_file,
          gmailMessageId: row.gmail_message_id,
          receivedAt: row.received_at,
        });
      }
    }

    return NextResponse.json({
      status: rows.length ? 'ready' : 'no_data',
      mine,
      range,
      filters: {
        family: familyFilter || null,
        assetId: assetId || null,
        families: [...new Set(enriched.map((row) => row.family))].sort(),
      },
      summary: {
        ...summary,
        reportDays: reportDates.length,
        latestReportedDate: latestDate,
        currentUnavailable: currentUnavailable.length,
      },
      daily,
      families,
      assets,
      currentUnavailable,
      sources: [...sourceMap.values()].sort((a, b) => b.reportedDate.localeCompare(a.reportedDate)),
      evidence: {
        methodology: 'reported_snapshot_v1',
        numerator: 'Observaciones diarias clasificadas como disponibles.',
        denominator: 'Observaciones diarias clasificables: disponible + indisponible.',
        standbyRule: 'STANDBY se mantiene fuera del denominador hasta validación operacional.',
        coverageRule: 'Cobertura = observaciones clasificables / filas de evidencia dentro del filtro.',
        timedAvailability: 'No utiliza minutos programados ni reemplaza la futura disponibilidad técnica horaria.',
        familyRule: 'Prioriza categoría/tipo canónico; si falta, usa familia derivada por nombre y la etiqueta como derivada.',
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error al calcular disponibilidad reportada' },
      { status: 500 },
    );
  }
}
