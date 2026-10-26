export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type StageCandidateRow = {
  id: number;
  import_id: string;
  source_sheet: string | null;
  source_row: number | null;
  description: string | null;
  equipment_type: string | null;
  brand: string | null;
  model: string | null;
  model_year: number | null;
  serial_number: string | null;
  chassis_number: string | null;
  engine_number: string | null;
  license_plate: string | null;
  insured_uf: number | string | null;
  net_book_value: number | string | null;
  source_payload: Record<string, unknown> | null;
};

function numeric(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data: imports, error: importsError } = await context.supabase
    .from('motil_finance_workbook_imports')
    .select('id,source_kind,filename,created_at')
    .eq('organization_id', context.organizationId)
    .in('source_kind', ['insured_asset_inventory', 'fixed_asset_depreciation_model'])
    .order('created_at', { ascending: false });

  if (importsError) return NextResponse.json({ error: importsError.message }, { status: 500 });

  const insurance = (imports || []).find((row: any) => row.source_kind === 'insured_asset_inventory') || null;
  const depreciation = (imports || []).find((row: any) => row.source_kind === 'fixed_asset_depreciation_model') || null;
  const importIds = [insurance?.id, depreciation?.id].filter(Boolean) as string[];

  if (importIds.length === 0) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: { candidates: 0, dualSource: 0, insuranceOnly: 0, depreciationOnly: 0 },
      candidates: [],
    });
  }

  const { data: rows, error: rowsError } = await context.supabase
    .from('motil_finance_asset_stage')
    .select('id,import_id,source_sheet,source_row,description,equipment_type,brand,model,model_year,serial_number,chassis_number,engine_number,license_plate,insured_uf,net_book_value,source_payload')
    .eq('organization_id', context.organizationId)
    .in('import_id', importIds)
    .is('canonical_asset_id', null)
    .contains('source_payload', { reconciliation_disposition: 'missing_canonical_asset_candidate' });

  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

  const grouped = new Map<string, StageCandidateRow[]>();
  for (const rawRow of rows || []) {
    const row = rawRow as StageCandidateRow;
    const payload = row.source_payload || {};
    const key =
      text(payload.reconciliation_candidate_key) ||
      (text(payload.reconciliation_evidence_token) ? `evidence:${text(payload.reconciliation_evidence_token)}` : null) ||
      `stage:${row.id}`;
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }

  const candidates = [...grouped.entries()].map(([key, evidenceRows]) => {
    const sourceKinds = new Set<string>();
    let insuredUf: number | null = null;
    let netBookValueClp: number | null = null;
    let title: string | null = null;
    let plate: string | null = null;
    let serial: string | null = null;
    let chassis: string | null = null;
    let engine: string | null = null;
    let modelYear: number | null = null;
    const evidence: Array<{
      source: 'insurance' | 'depreciation';
      stageId: number;
      sheet: string | null;
      row: number | null;
      description: string | null;
      rationale: string | null;
    }> = [];

    for (const row of evidenceRows) {
      const payload = row.source_payload || {};
      const source =
        row.import_id === insurance?.id
          ? 'insurance'
          : 'depreciation';
      sourceKinds.add(source);
      const rowInsuredUf = numeric(row.insured_uf);
      const rowBook = numeric(row.net_book_value);
      if (rowInsuredUf != null) insuredUf = Math.max(insuredUf ?? rowInsuredUf, rowInsuredUf);
      if (rowBook != null) netBookValueClp = Math.max(netBookValueClp ?? rowBook, rowBook);
      title =
        title ||
        text(row.description) ||
        text(payload.description) ||
        [text(row.brand), text(row.model)].filter(Boolean).join(' ') ||
        text(row.equipment_type);
      plate = plate || text(row.license_plate);
      serial = serial || text(row.serial_number) || text(payload.insurance_serial_number);
      chassis = chassis || text(row.chassis_number) || text(payload.insurance_chassis_number);
      engine = engine || text(row.engine_number) || text(payload.insurance_engine_number);
      modelYear = modelYear || (row.model_year ? Number(row.model_year) : null);
      evidence.push({
        source,
        stageId: row.id,
        sheet: row.source_sheet,
        row: row.source_row,
        description: text(row.description) || text(payload.description),
        rationale: text(payload.reconciliation_evidence),
      });
    }

    const dualSource = sourceKinds.size > 1;
    return {
      key,
      title: title || plate || serial || 'Activo candidato',
      plate,
      serial,
      chassis,
      engine,
      modelYear,
      insuredUf,
      netBookValueClp,
      dualSource,
      sourceCount: sourceKinds.size,
      evidenceCount: evidence.length,
      priority: dualSource ? 3 : (plate || serial || chassis ? 2 : 1),
      evidence,
    };
  }).sort((a, b) =>
    b.priority - a.priority ||
    (b.netBookValueClp || 0) - (a.netBookValueClp || 0) ||
    (b.insuredUf || 0) - (a.insuredUf || 0) ||
    a.title.localeCompare(b.title, 'es')
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      candidates: candidates.length,
      dualSource: candidates.filter((row) => row.dualSource).length,
      insuranceOnly: candidates.filter((row) => row.evidence.every((item) => item.source === 'insurance')).length,
      depreciationOnly: candidates.filter((row) => row.evidence.every((item) => item.source === 'depreciation')).length,
    },
    candidates,
    semantics: {
      candidate: 'Evidencia de una entidad física que no tiene contraparte canónica verificable. No crea una Ficha 360 automáticamente.',
      dualSource: 'La misma entidad aparece de forma independiente en seguro y depreciación.',
      approval: 'Crear una Ficha 360 requiere revisión operacional; MOTIL conserva la fuente y no inventa campos faltantes.',
    },
  });
}
