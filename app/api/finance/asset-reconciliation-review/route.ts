export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

function classifyRow(row: {
  cost_center_raw?: string | null;
  source_sheet?: string | null;
  source_payload?: Record<string, unknown> | null;
}) {
  const raw = String(row.cost_center_raw || '').trim();
  const normalized = raw.toLowerCase();

  if (normalized.startsWith('depreciado')) {
    return { key: 'source_depreciated', label: 'Fuente: depreciado', rank: 4 };
  }
  if (normalized.startsWith('vendido')) {
    return { key: 'source_sold', label: 'Fuente: vendido', rank: 4 };
  }
  const disposition = String(row.source_payload?.reconciliation_disposition || '').trim().toLowerCase();
  if (disposition === 'missing_canonical_asset_candidate') {
    return { key: 'missing_canonical_asset_candidate', label: 'Posible Ficha 360 faltante', rank: 6 };
  }
  if (disposition === 'ambiguous_existing_asset_family') {
    const count = Number(row.source_payload?.reconciliation_candidate_count || 0);
    return {
      key: 'ambiguous_existing_asset_family',
      label: count > 1 ? `Unidad ambigua · ${count} candidatas` : 'Unidad ambigua',
      rank: 5,
    };
  }
  if (disposition === 'aggregate_multi_asset_financial_line') {
    return { key: 'aggregate_multi_asset_financial_line', label: 'Línea financiera agregada', rank: 5 };
  }
  if (disposition === 'insufficient_unit_identity') {
    return { key: 'insufficient_unit_identity', label: 'Identidad insuficiente', rank: 4 };
  }
  if (disposition === 'unrepresented_operational_model') {
    return { key: 'unrepresented_operational_model', label: 'Modelo no representado', rank: 4 };
  }
  if (disposition === 'component_or_spare_financial_line') {
    return { key: 'component_or_spare_financial_line', label: 'Componente / repuesto', rank: 3 };
  }
  if (disposition === 'low_materiality_secondary_review') {
    return { key: 'low_materiality_secondary_review', label: 'Revisión secundaria', rank: 1 };
  }

  const centerType = String(row.source_payload?.canonical_cost_center_type || '').trim().toLowerCase();
  if (centerType === 'asset') {
    return { key: 'asset_center_without_asset', label: 'Centro de activo sin Ficha 360', rank: 5 };
  }
  if (centerType) {
    return { key: 'non_asset_cost_center', label: 'Centro no operacional', rank: 3 };
  }
  if (raw && raw !== '0') {
    return { key: 'cost_center_without_asset', label: 'Centro sin contraparte MOTIL', rank: 3 };
  }
  return { key: 'missing_identifier', label: 'Sin identificador operacional', rank: 2 };
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data: source, error: sourceError } = await context.supabase
    .from('motil_finance_workbook_imports')
    .select('id,filename,source_cutoff_date,review_status,metadata,created_at')
    .eq('organization_id', context.organizationId)
    .eq('source_kind', 'fixed_asset_depreciation_model')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

  const { data: insuranceSource, error: insuranceSourceError } = await context.supabase
    .from('motil_finance_workbook_imports')
    .select('id,filename,source_cutoff_date,review_status,metadata,created_at')
    .eq('organization_id', context.organizationId)
    .eq('source_kind', 'insured_asset_inventory')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (insuranceSourceError) {
    return NextResponse.json({ error: insuranceSourceError.message }, { status: 500 });
  }

  if (!source) {
    return NextResponse.json({
      source: null,
      summary: {
        sourceRows: 0,
        linkedRows: 0,
        linkedAssets: 0,
        singleAssets: 0,
        conflictAssets: 0,
        unresolvedRows: 0,
        materialReviewComplete: false,
        materialReviewFloorClp: 0,
        unexplainedOperationalRows: 0,
        unexplainedOperationalBookValueClp: 0,
        depreciationCoverage: {
          rows: 0,
          withCurrentDepreciation: 0,
          withAccumulatedDepreciation: 0,
          withBookValue: 0,
          withRemainingLife: 0,
          linkedCanonical: 0,
          linkedCanonicalAssets: 0,
          reviewRequired: 0,
        },
      },
      insurance: null,
      unresolved: { byReason: {}, rows: [] },
    });
  }

  const { data: unresolvedRows, error: unresolvedError } = await context.supabase
    .from('motil_finance_asset_stage')
    .select('id,source_sheet,source_row,description,cost_center_raw,net_book_value,updated_asset,identity_status,source_payload')
    .eq('organization_id', context.organizationId)
    .eq('import_id', source.id)
    .is('canonical_asset_id', null)
    .order('source_sheet', { ascending: true })
    .order('source_row', { ascending: true });

  if (unresolvedError) return NextResponse.json({ error: unresolvedError.message }, { status: 500 });

  const { data: depreciationRows, error: depreciationError } = await context.supabase
    .from('motil_finance_asset_stage')
    .select('canonical_asset_id,depreciation_current,total_accum_depr,net_book_value,remaining_life_months,identity_status')
    .eq('organization_id', context.organizationId)
    .eq('import_id', source.id);

  if (depreciationError) return NextResponse.json({ error: depreciationError.message }, { status: 500 });

  const linkedCanonicalAssetIds = new Set<string>();
  const linkedRowsByAsset = new Map<string, number>();
  const depreciationCoverage = (depreciationRows || []).reduce((acc, row: any) => {
    acc.rows += 1;
    if (row.depreciation_current !== null) acc.withCurrentDepreciation += 1;
    if (row.total_accum_depr !== null) acc.withAccumulatedDepreciation += 1;
    if (row.net_book_value !== null) acc.withBookValue += 1;
    if (row.remaining_life_months !== null) acc.withRemainingLife += 1;
    if (row.canonical_asset_id) {
      acc.linkedCanonical += 1;
      const assetId = String(row.canonical_asset_id);
      linkedCanonicalAssetIds.add(assetId);
      linkedRowsByAsset.set(assetId, (linkedRowsByAsset.get(assetId) || 0) + 1);
    }
    if (String(row.identity_status || '') === 'review_required') acc.reviewRequired += 1;
    return acc;
  }, {
    rows: 0,
    withCurrentDepreciation: 0,
    withAccumulatedDepreciation: 0,
    withBookValue: 0,
    withRemainingLife: 0,
    linkedCanonical: 0,
    linkedCanonicalAssets: 0,
    reviewRequired: 0,
  });
  depreciationCoverage.linkedCanonicalAssets = linkedCanonicalAssetIds.size;

  const metadata = source.metadata && typeof source.metadata === 'object'
    ? source.metadata as Record<string, unknown>
    : {};
  const stage = metadata.stage && typeof metadata.stage === 'object'
    ? metadata.stage as Record<string, unknown>
    : {};

  const sourceRows = depreciationCoverage.rows;
  const linkedRows = depreciationCoverage.linkedCanonical;
  const linkedAssets = depreciationCoverage.linkedCanonicalAssets;
  const singleAssets = Array.from(linkedRowsByAsset.values()).filter((count) => count === 1).length;
  const conflictAssets = Array.from(linkedRowsByAsset.values()).filter((count) => count > 1).length;

  const classified = (unresolvedRows || []).map((row: any) => ({
    ...row,
    reason: classifyRow(row),
    terminal: ['finance_only_non_asset','finance_only_capex_context'].includes(String(row.source_payload?.reconciliation_terminal_state || '')),
  }));
  const actionableRows = classified.filter((row) => !row.terminal);
  const terminalRows = classified.filter((row) => row.terminal);
  const structuredCandidateRows = actionableRows.filter((row) =>
    Boolean(
      row.source_payload?.facility_candidate_group ||
      row.source_payload?.asset_candidate_key ||
      row.source_payload?.asset_candidate_family_key
    )
  );
  const structuredCandidateKeys = new Set(
    structuredCandidateRows
      .map((row) =>
        row.source_payload?.facility_candidate_group ||
        row.source_payload?.asset_candidate_key ||
        row.source_payload?.asset_candidate_family_key ||
        null
      )
      .filter(Boolean)
      .map(String)
  );
  const unstructuredRows = actionableRows.length - structuredCandidateRows.length;

  const byReason = actionableRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.reason.key] = (acc[row.reason.key] || 0) + 1;
    return acc;
  }, {});
  const terminalByReason = terminalRows.reduce<Record<string, number>>((acc, row) => {
    const key = String(row.source_payload?.reconciliation_terminal_reason || row.reason.key || 'finance_only_non_asset');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const reviewRows = actionableRows
    .sort((a, b) =>
      b.reason.rank - a.reason.rank ||
      String(a.source_sheet || '').localeCompare(String(b.source_sheet || '')) ||
      Number(a.source_row || 0) - Number(b.source_row || 0)
    )
    .slice(0, 60);

  let insuranceSummary = null;
  if (insuranceSource) {
    const { data: insuranceRows, error: insuranceRowsError } = await context.supabase
      .from('motil_finance_asset_stage')
      .select('canonical_asset_id,identity_status,source_payload')
      .eq('organization_id', context.organizationId)
      .eq('import_id', insuranceSource.id);

    if (insuranceRowsError) {
      return NextResponse.json({ error: insuranceRowsError.message }, { status: 500 });
    }

    const insuranceLinkedAssetIds = new Set<string>();
    let insuranceLinkedRows = 0;
    let insuranceStructuredCandidates = 0;
    let insuranceUnitCandidates = 0;
    let insuranceFamilyCandidates = 0;
    let insuranceDiscrepancies = 0;

    for (const row of insuranceRows || []) {
      if (row.canonical_asset_id) {
        insuranceLinkedRows += 1;
        insuranceLinkedAssetIds.add(String(row.canonical_asset_id));
        continue;
      }

      const payload = row.source_payload && typeof row.source_payload === 'object'
        ? row.source_payload as Record<string, unknown>
        : {};
      if (payload.asset_candidate_key) {
        insuranceStructuredCandidates += 1;
        insuranceUnitCandidates += 1;
      } else if (payload.asset_candidate_family_key) {
        insuranceStructuredCandidates += 1;
        insuranceFamilyCandidates += 1;
      }
      if (String(row.identity_status || '') === 'conflict') insuranceDiscrepancies += 1;
    }

    const insuranceSourceRows = (insuranceRows || []).length;
    const insuranceUnresolvedRows = insuranceSourceRows - insuranceLinkedRows;
    const insuranceUnclassifiedRows = Math.max(0, insuranceUnresolvedRows - insuranceStructuredCandidates);

    insuranceSummary = {
      filename: insuranceSource.filename,
      sourceRows: insuranceSourceRows,
      linkedRows: insuranceLinkedRows,
      linkedAssets: insuranceLinkedAssetIds.size,
      unresolvedRows: insuranceUnresolvedRows,
      unclassifiedRows: insuranceUnclassifiedRows,
      missingCandidates: insuranceUnitCandidates,
      ambiguousRows: insuranceFamilyCandidates,
      discrepancies: insuranceDiscrepancies,
    };
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    source: {
      id: source.id,
      filename: source.filename,
      cutoffDate: source.source_cutoff_date,
      reviewStatus: source.review_status,
    },
    insurance: insuranceSummary,
    summary: {
      sourceRows,
      linkedRows,
      linkedAssets,
      singleAssets,
      conflictAssets,
      unresolvedRows: actionableRows.length,
      structuredCandidateRows: structuredCandidateRows.length,
      structuredCandidateGroups: structuredCandidateKeys.size,
      unstructuredRows,
      terminalRows: terminalRows.length,
      materialReviewComplete: Boolean(stage.material_operational_review_complete),
      materialReviewFloorClp: Number(stage.material_operational_review_floor_clp || 0),
      unexplainedOperationalRows: Number(stage.unexplained_operational_rows || 0),
      unexplainedOperationalBookValueClp: Number(stage.unexplained_operational_book_value_clp || 0),
      depreciationCoverage,
    },
    unresolved: {
      byReason,
      rows: reviewRows,
      limitedTo: 60,
    },
    terminal: {
      rows: terminalRows.length,
      byReason: terminalByReason,
    },
    semantics: {
      unresolved: 'Fila financiera que aún no tiene contraparte canónica verificable en MOTIL. No implica error en la fuente.',
      source_depreciated: 'La propia fuente marca el registro como depreciado; MOTIL conserva ese estado sin inferir baja física.',
      source_sold: 'La propia fuente marca el registro como vendido; MOTIL conserva ese estado sin inferir fecha ni comprador.',
      missing_canonical_asset_candidate: 'La fila contiene un identificador específico que no aparece en activos canónicos ni en alias operacionales verificados. Es candidata a una nueva Ficha 360, no a un match forzado.',
      ambiguous_existing_asset_family: 'La familia o modelo existe en MOTIL, pero varias Fichas 360 son compatibles. Se requiere una patente, serie, número de unidad u otra evidencia para elegir una sola.',
      aggregate_multi_asset_financial_line: 'La propia fila financiera agrupa más de un activo o componentes heterogéneos. No puede promoverse a una única Ficha 360 sin desagregar la fuente.',
      insufficient_unit_identity: 'La fila parece operacional, pero no trae una llave suficiente para distinguir una unidad concreta sin inferencia.',
      unrepresented_operational_model: 'La fuente identifica un modelo operacional específico que no aparece en activos canónicos ni alias verificados. Puede requerir una o más Fichas 360, pero la cantidad de unidades no se infiere.',
      component_or_spare_financial_line: 'La fila representa un componente o repuesto capitalizado, no un activo operacional completo. Se conserva financieramente sin crear una Ficha 360 de equipo.',
      low_materiality_secondary_review: 'La fila operacional queda bajo el umbral material actual de CLP 100.000 por registro. Se conserva completa para revisión secundaria y no se infiere una identidad.',
      asset_center_without_asset: 'El centro de costo canónico está tipado como activo, pero todavía no existe una Ficha 360 canónica que permita enlazar la fila con seguridad.',
      non_asset_cost_center: 'El centro de costo existe canónicamente como área o administración; no se fuerza a una Ficha 360 de equipo.',
      cost_center_without_asset: 'Existe un centro de costo en la fuente, pero no una contraparte canónica exacta en el registro operacional de activos.',
      missing_identifier: 'La fila no trae centro, patente, serie o nombre canónico suficiente para una conciliación determinística.',
    },
  });
}
