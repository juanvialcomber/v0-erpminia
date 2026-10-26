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

  const metadata = source.metadata && typeof source.metadata === 'object'
    ? source.metadata as Record<string, unknown>
    : {};
  const stage = metadata.stage && typeof metadata.stage === 'object'
    ? metadata.stage as Record<string, unknown>
    : {};

  const sourceRows = Number(stage.rows || 0);
  const linkedRows = Number(stage.identity_linked_rows || 0);
  const linkedAssets = Number(stage.identity_linked_assets || 0);
  const singleAssets = Number(stage.identity_single_assets || 0);
  const conflictAssets = Number(stage.identity_conflict_assets || 0);

  const classified = (unresolvedRows || []).map((row: any) => ({
    ...row,
    reason: classifyRow(row),
  }));
  const byReason = classified.reduce<Record<string, number>>((acc, row) => {
    acc[row.reason.key] = (acc[row.reason.key] || 0) + 1;
    return acc;
  }, {});

  const reviewRows = classified
    .sort((a, b) =>
      b.reason.rank - a.reason.rank ||
      String(a.source_sheet || '').localeCompare(String(b.source_sheet || '')) ||
      Number(a.source_row || 0) - Number(b.source_row || 0)
    )
    .slice(0, 60);

  const insuranceMetadata = insuranceSource?.metadata && typeof insuranceSource.metadata === 'object'
    ? insuranceSource.metadata as Record<string, unknown>
    : {};
  const insuranceStage = insuranceMetadata.stage && typeof insuranceMetadata.stage === 'object'
    ? insuranceMetadata.stage as Record<string, unknown>
    : {};
  const insuranceSummary = insuranceSource ? {
    filename: insuranceSource.filename,
    sourceRows: Number(insuranceStage.rows || 0),
    linkedRows: Number(insuranceStage.identity_linked_rows || 0),
    linkedAssets: Number(insuranceStage.identity_linked_assets || 0),
    unresolvedRows: Number(insuranceStage.identity_unresolved_rows || 0),
    unclassifiedRows: Number(insuranceStage.unclassified_rows || 0),
    missingCandidates: Number(insuranceStage.missing_canonical_candidate_rows || 0),
    ambiguousRows: Number(insuranceStage.ambiguous_existing_family_rows || 0),
    discrepancies: Number(insuranceStage.identity_source_discrepancy_rows || 0),
  } : null;

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
      unresolvedRows: classified.length,
      materialReviewComplete: Boolean(stage.material_operational_review_complete),
      materialReviewFloorClp: Number(stage.material_operational_review_floor_clp || 0),
      unexplainedOperationalRows: Number(stage.unexplained_operational_rows || 0),
      unexplainedOperationalBookValueClp: Number(stage.unexplained_operational_book_value_clp || 0),
    },
    unresolved: {
      byReason,
      rows: reviewRows,
      limitedTo: 60,
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
      asset_center_without_asset: 'El centro de costo canónico está tipado como activo, pero todavía no existe una Ficha 360 canónica que permita enlazar la fila con seguridad.',
      non_asset_cost_center: 'El centro de costo existe canónicamente como área o administración; no se fuerza a una Ficha 360 de equipo.',
      cost_center_without_asset: 'Existe un centro de costo en la fuente, pero no una contraparte canónica exacta en el registro operacional de activos.',
      missing_identifier: 'La fila no trae centro, patente, serie o nombre canónico suficiente para una conciliación determinística.',
    },
  });
}
