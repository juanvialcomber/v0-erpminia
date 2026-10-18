import { NextRequest, NextResponse } from 'next/server';
// Explicit handover gate: disabled unless this deployment is the appointed cron executor.
function cronExecutorEnabled() {
  return process.env.MOTIL_CRON_EXECUTOR_ENABLED === 'true';
}

import { getSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const SOURCE_VIEWS = [
  'admin_finance_role_kpi_snapshot_v1',
  'contract_document_role_kpi_snapshot_v1',
  'drilling_role_kpi_snapshot_v1',
  'hse_role_kpi_snapshot_v1',
  'inventory_geology_role_kpi_snapshot_v1',
  'maintenance_role_kpi_snapshot_v1',
] as const;

function chileBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function capture(request: NextRequest) {
  if (!cronExecutorEnabled()) {
    return NextResponse.json({ error: 'Cron executor disabled on this deployment' }, { status: 503 });
  }

  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const snapshotDate = chileBusinessDate();
  const results: Array<{ source: string; rows: number }> = [];

  for (const sourceView of SOURCE_VIEWS) {
    const { data, error } = await supabase
      .from(sourceView)
      .select('organization_id,cargo_id,cargo_name,kpi_key,label,unit,measured_value,target_value,direction,evaluation_state,evidence');

    if (error) {
      console.error(`[role-kpi-history] ${sourceView}:`, error.message);
      return NextResponse.json({ error: `No fue posible capturar ${sourceView}` }, { status: 500 });
    }

    const rows = (data || []).map((row) => ({
      snapshot_date: snapshotDate,
      source_view: sourceView,
      organization_id: row.organization_id,
      cargo_id: row.cargo_id,
      cargo_name: row.cargo_name,
      kpi_key: row.kpi_key,
      label: row.label,
      unit: row.unit,
      measured_value: row.measured_value,
      target_value: row.target_value,
      direction: row.direction,
      evaluation_state: row.evaluation_state,
      evidence: row.evidence || {},
    }));

    if (rows.length) {
      const { error: upsertError } = await supabase
        .from('role_kpi_snapshot_history')
        .upsert(rows, {
          onConflict: 'snapshot_date,source_view,organization_id,cargo_id,kpi_key',
          ignoreDuplicates: false,
        });

      if (upsertError) {
        console.error(`[role-kpi-history] persist ${sourceView}:`, upsertError.message);
        return NextResponse.json({ error: `No fue posible persistir ${sourceView}` }, { status: 500 });
      }
    }

    results.push({ source: sourceView, rows: rows.length });
  }

  const { data: rrhhCargo, error: rrhhCargoError } = await supabase
    .from('cargos')
    .select('id,name')
    .eq('name', 'JEFE RRHH')
    .maybeSingle();
  if (rrhhCargoError) return NextResponse.json({ error: rrhhCargoError.message }, { status: 500 });

  const { data: peopleRows, error: peopleError } = await supabase
    .schema('intelligence')
    .from('people_overview')
    .select('organization_id,active_people,credentials_expiring_30d,expired_credentials,epp_renewal_30d,work_order_count,people_with_ot_without_competencies');
  if (peopleError) return NextResponse.json({ error: peopleError.message }, { status: 500 });

  if (rrhhCargo) {
    const hrDefinitions = [
      ['active_people', 'Personas evidenciadas', 'personas'],
      ['credentials_expiring_30d', 'Credenciales por vencer 30d', 'credenciales'],
      ['expired_credentials', 'Credenciales vencidas', 'credenciales'],
      ['epp_renewal_30d', 'EPP por renovar 30d', 'asignaciones'],
      ['work_order_count', 'OT con personas evidenciadas', 'OT'],
      ['people_with_ot_without_competencies', 'Personas con OT sin competencias', 'personas'],
    ] as const;

    const hrHistoryRows = (peopleRows || []).flatMap((row) =>
      hrDefinitions.map(([key, label, unit]) => ({
        snapshot_date: snapshotDate,
        source_view: 'intelligence.people_overview',
        organization_id: row.organization_id,
        cargo_id: rrhhCargo.id,
        cargo_name: rrhhCargo.name,
        kpi_key: key,
        label,
        unit,
        measured_value: row[key],
        target_value: null,
        direction: null,
        evaluation_state: 'baseline',
        evidence: { source_note: 'Cobertura de personas derivada de evidencia canónica disponible; no equivale a nómina maestra.' },
      }))
    );

    if (hrHistoryRows.length) {
      const { error: hrPersistError } = await supabase
        .from('role_kpi_snapshot_history')
        .upsert(hrHistoryRows, {
          onConflict: 'snapshot_date,source_view,organization_id,cargo_id,kpi_key',
          ignoreDuplicates: false,
        });
      if (hrPersistError) return NextResponse.json({ error: hrPersistError.message }, { status: 500 });
    }
    results.push({ source: 'intelligence.people_overview', rows: hrHistoryRows.length });
  }

  return NextResponse.json({ ok: true, snapshotDate, timeZone: 'America/Santiago', sources: results });
}

export async function GET(request: NextRequest) {
  return capture(request);
}

export async function POST(request: NextRequest) {
  return capture(request);
}
