export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

function text(value: unknown) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data: imports, error: importsError } = await context.supabase
    .from('motil_finance_workbook_imports')
    .select('id,filename,source_cutoff_date,created_at')
    .eq('organization_id', context.organizationId)
    .eq('source_kind', 'fixed_asset_depreciation_model')
    .order('created_at', { ascending: false })
    .limit(1);

  if (importsError) return NextResponse.json({ error: importsError.message }, { status: 500 });

  const source = imports?.[0] || null;
  if (!source) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: null,
      summary: { groups: 0, rows: 0, singleFacility: 0, multiUnitFamily: 0, pendingReview: 0, representedBookValueClp: 0 },
      facilities: [],
    });
  }

  const { data: rows, error: rowsError } = await context.supabase
    .from('motil_finance_asset_stage')
    .select('id,source_sheet,source_row,description,cost_center_raw,net_book_value,source_payload')
    .eq('organization_id', context.organizationId)
    .eq('import_id', source.id)
    .is('canonical_asset_id', null);

  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

  const facilityRows = (rows || []).filter((row: any) => Boolean(text(row.source_payload?.facility_candidate_group)));
  const grouped = new Map<string, any[]>();

  for (const row of facilityRows) {
    const key = text((row as any).source_payload?.facility_candidate_group);
    if (!key) continue;
    const existing = grouped.get(key) || [];
    existing.push(row);
    grouped.set(key, existing);
  }

  const issueKeys = [...grouped.keys()].map((key) => 'finance_facility_candidate:' + key);
  let reviewRows: any[] = [];
  if (issueKeys.length > 0) {
    const { data, error } = await context.supabase
      .from('data_reconciliation_reviews')
      .select('id,issue_key,issue_type,status,resolution_note,evidence_reference,reviewed_by,reviewed_at')
      .eq('organization_id', context.organizationId)
      .in('issue_key', issueKeys);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    reviewRows = data || [];
  }

  const reviewByKey = new Map(
    reviewRows.map((row: any) => [String(row.issue_key || '').replace(/^finance_facility_candidate:/, ''), row])
  );

  const facilities = [...grouped.entries()].map(([key, evidenceRows]) => {
    const firstPayload = evidenceRows[0]?.source_payload || {};
    const scope = text(firstPayload.facility_candidate_scope) || 'single_facility';
    const label = text(firstPayload.facility_candidate_label) || key;
    const review = reviewByKey.get(key) || null;
    const values = evidenceRows.map((row) => numeric(row.net_book_value)).filter((value): value is number => value != null);
    const representedBookValueClp = values.reduce((sum, value) => sum + value, 0);

    return {
      key,
      label,
      scope,
      representedBookValueClp,
      rowCount: evidenceRows.length,
      review: review ? {
        id: review.id,
        issueType: review.issue_type,
        status: review.status,
        resolutionNote: review.resolution_note,
        evidenceReference: review.evidence_reference,
        reviewedBy: review.reviewed_by,
        reviewedAt: review.reviewed_at,
      } : null,
      evidence: evidenceRows.map((row) => ({
        stageId: row.id,
        sheet: row.source_sheet,
        row: row.source_row,
        description: text(row.description),
        netBookValueClp: numeric(row.net_book_value),
        costCenterRaw: text(row.cost_center_raw),
      })),
    };
  }).sort((a, b) =>
    (a.scope === 'multi_unit_family' ? 0 : 1) - (b.scope === 'multi_unit_family' ? 0 : 1) ||
    b.representedBookValueClp - a.representedBookValueClp ||
    a.label.localeCompare(b.label, 'es')
  );

  const representedBookValueClp = facilities.reduce((sum, row) => sum + row.representedBookValueClp, 0);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    source: {
      filename: source.filename,
      cutoffDate: source.source_cutoff_date,
    },
    summary: {
      groups: facilities.length,
      rows: facilityRows.length,
      singleFacility: facilities.filter((row) => row.scope === 'single_facility').length,
      multiUnitFamily: facilities.filter((row) => row.scope === 'multi_unit_family').length,
      pendingReview: facilities.filter((row) => !row.review || row.review.status === 'open').length,
      representedBookValueClp,
    },
    facilities,
    semantics: {
      singleFacility: 'Una instalación identificable 1:1 desde la fuente financiera. Requiere revisión antes de crear una Ficha 360.',
      multiUnitFamily: 'Una familia con varias unidades o líneas no separables 1:1. Requiere desagregación antes de crear Fichas 360.',
      representedBookValueClp: 'Suma del valor libro de las líneas fuente agrupadas. No implica valor de mercado ni costo de reposición.',
      approval: 'Esta vista es de revisión. No crea, fusiona ni modifica Fichas 360.',
    },
  });
}
