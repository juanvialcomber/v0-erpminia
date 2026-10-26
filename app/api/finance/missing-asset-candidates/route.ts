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
  const filenameByImportId = new Map((imports || []).map((row: any) => [row.id, row.filename]));
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

  const issueKeys = [...grouped.keys()].map((key) => 'asset_missing_candidate:' + key);
  const { data: reviewRows, error: reviewError } = await context.supabase
    .from('data_reconciliation_reviews')
    .select('id,issue_key,status,resolution_note,reviewed_by,reviewed_at')
    .eq('organization_id', context.organizationId)
    .eq('entity_type', 'asset')
    .eq('issue_type', 'missing_canonical_asset_candidate')
    .in('issue_key', issueKeys);

  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 500 });

  const reviewByIssueKey = new Map(
    (reviewRows || []).map((row: any) => [row.issue_key, row])
  );

  const { data: conflictRows, error: conflictError } = await context.supabase
    .from('data_reconciliation_reviews')
    .select('id,issue_key,entity_id,status,resolution_note,evidence_reference,reviewed_by,reviewed_at')
    .eq('organization_id', context.organizationId)
    .eq('entity_type', 'asset')
    .eq('issue_type', 'canonical_identity_source_conflict')
    .eq('status', 'open')
    .order('created_at', { ascending: true });

  if (conflictError) return NextResponse.json({ error: conflictError.message }, { status: 500 });

  const identityConflicts = (conflictRows || []).map((row: any) => ({
    id: row.id,
    issueKey: row.issue_key,
    entityId: row.entity_id,
    status: row.status,
    resolutionNote: row.resolution_note,
    evidenceReference: row.evidence_reference,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  }));

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
    let manufacturer: string | null = null;
    let sourceModel: string | null = null;
    let equipmentType: string | null = null;
    let reviewStatus: string | null = null;
    let reviewBasis: string | null = null;
    let reviewSourceCount: number | null = null;
    let purchaseCostCenterEvidence: string | null = null;
    let purchaseEvidenceOrders: number | null = null;
    let purchaseEvidenceLines: number | null = null;
    const evidence: Array<{
      source: 'insurance' | 'depreciation';
      stageId: number;
      sheet: string | null;
      row: number | null;
      sourceFile: string | null;
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
      manufacturer = manufacturer || text(row.brand);
      sourceModel = sourceModel || text(row.model);
      equipmentType = equipmentType || text(row.equipment_type);
      reviewStatus = reviewStatus || text(payload.candidate_review_status);
      reviewBasis = reviewBasis || text(payload.candidate_review_basis);
      const payloadSourceCount = numeric(payload.candidate_review_source_count);
      if (payloadSourceCount != null) reviewSourceCount = Math.max(reviewSourceCount ?? payloadSourceCount, payloadSourceCount);
      purchaseCostCenterEvidence = purchaseCostCenterEvidence || text(payload.purchase_cost_center_evidence);
      const payloadPurchaseOrders = numeric(payload.purchase_evidence_orders);
      if (payloadPurchaseOrders != null) purchaseEvidenceOrders = Math.max(purchaseEvidenceOrders ?? payloadPurchaseOrders, payloadPurchaseOrders);
      const payloadPurchaseLines = numeric(payload.purchase_evidence_lines);
      if (payloadPurchaseLines != null) purchaseEvidenceLines = Math.max(purchaseEvidenceLines ?? payloadPurchaseLines, payloadPurchaseLines);
      evidence.push({
        source,
        stageId: row.id,
        sheet: row.source_sheet,
        row: row.source_row,
        sourceFile: text(filenameByImportId.get(row.import_id)),
        description: text(row.description) || text(payload.description),
        rationale: text(payload.reconciliation_evidence),
      });
    }

    const review = reviewByIssueKey.get('asset_missing_candidate:' + key) || null;
    const dualSource = sourceKinds.size > 1;
    const normalizedEquipmentType = String(equipmentType || '').toLowerCase();
    const normalizedTitle = String(title || '').toLowerCase();
    const typeEvidence = normalizedEquipmentType || normalizedTitle;
    const draftAssetType = /camioneta|camión|camion/.test(typeEvidence) ? 'vehicle' : null;
    const draftCategory =
      typeEvidence.includes('camioneta') ? 'CAMIONETAS' :
      /camión|camion/.test(typeEvidence) ? 'CAMIONES' :
      null;
    const readyForReview = reviewStatus === 'ready_for_asset_review';
    const identityVerifiedSingleSource = reviewStatus === 'identity_verified_single_source';
    const modelOnlyNeedsOperationalIdentity = reviewStatus === 'model_only_needs_operational_identity';
    const sourceCodeNeedsOperationalValidation = reviewStatus === 'source_code_needs_operational_validation';
    return {
      key,
      title: title || plate || serial || 'Activo candidato',
      plate,
      serial,
      chassis,
      engine,
      modelYear,
      manufacturer,
      sourceModel,
      equipmentType,
      canonicalDraft: {
        assetType: draftAssetType,
        category: draftCategory,
        manufacturer,
        model: sourceModel,
        serialNumber: serial,
        licensePlate: plate,
        sourceName: title,
        requiredBeforeCreation: ['asset_code', 'canonical_import_batch'],
        note: 'No se crea la Ficha 360 hasta asignar código de activo y lineage canónico aprobado.',
      },
      insuredUf,
      netBookValueClp,
      dualSource,
      readyForReview,
      identityVerifiedSingleSource,
      modelOnlyNeedsOperationalIdentity,
      sourceCodeNeedsOperationalValidation,
      reviewStatus,
      reviewBasis,
      reviewSourceCount,
      operationalEvidence: {
        purchaseCostCenter: purchaseCostCenterEvidence,
        purchaseOrders: purchaseEvidenceOrders,
        purchaseLines: purchaseEvidenceLines,
      },
      review: review ? {
        id: review.id,
        status: review.status,
        resolutionNote: review.resolution_note,
        reviewedBy: review.reviewed_by,
        reviewedAt: review.reviewed_at,
      } : null,
      sourceCount: sourceKinds.size,
      evidenceCount: evidence.length,
      priority: readyForReview ? 5 : identityVerifiedSingleSource ? 4 : dualSource ? 3 : modelOnlyNeedsOperationalIdentity ? 2 : sourceCodeNeedsOperationalValidation ? 1 : (plate || serial || chassis ? 2 : 0),
      evidence,
    };
  }).sort((a, b) =>
    b.priority - a.priority ||
    (b.netBookValueClp || 0) - (a.netBookValueClp || 0) ||
    (b.insuredUf || 0) - (a.insuredUf || 0) ||
    a.title.localeCompare(b.title, 'es')
  );

  const sumBookValue = (predicate: (row: typeof candidates[number]) => boolean) =>
    candidates
      .filter(predicate)
      .reduce((sum, row) => sum + Number(row.netBookValueClp || 0), 0);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      candidates: candidates.length,
      candidateBookValueClp: sumBookValue(() => true),
      readyForReviewBookValueClp: sumBookValue((row) => row.readyForReview),
      identityVerifiedSingleSourceBookValueClp: sumBookValue((row) => row.identityVerifiedSingleSource),
      modelOnlyBookValueClp: sumBookValue((row) => row.modelOnlyNeedsOperationalIdentity),
      sourceCodeBookValueClp: sumBookValue((row) => row.sourceCodeNeedsOperationalValidation),
      dualSource: candidates.filter((row) => row.dualSource).length,
      readyForReview: candidates.filter((row) => row.readyForReview).length,
      readyDualFinance: candidates.filter((row) => row.reviewBasis === 'dual_source_exact_identity').length,
      readyPurchaseEvidence: candidates.filter((row) => row.reviewBasis === 'exact_plate_plus_purchase_cost_center').length,
      pendingReview: candidates.filter((row) => row.readyForReview && (!row.review || row.review.status === 'open')).length,
      acceptedForCreation: candidates.filter((row) => row.review?.status === 'accepted').length,
      ignoredCandidates: candidates.filter((row) => row.review?.status === 'ignored').length,
      openIdentityConflicts: identityConflicts.length,
      identityVerifiedSingleSource: candidates.filter((row) => row.identityVerifiedSingleSource).length,
      modelOnlyNeedsOperationalIdentity: candidates.filter((row) => row.modelOnlyNeedsOperationalIdentity).length,
      sourceCodeNeedsOperationalValidation: candidates.filter((row) => row.sourceCodeNeedsOperationalValidation).length,
      insuranceOnly: candidates.filter((row) => row.evidence.every((item) => item.source === 'insurance')).length,
      depreciationOnly: candidates.filter((row) => row.evidence.every((item) => item.source === 'depreciation')).length,
    },
    identityConflicts,
    candidates,
    semantics: {
      candidate: 'Evidencia de una entidad física que no tiene contraparte canónica verificable. No crea una Ficha 360 automáticamente.',
      dualSource: 'La misma entidad aparece de forma independiente en seguro y depreciación.',
      readyForReview: 'Candidata con identidad física exacta confirmada en dos fuentes independientes y sin contraparte canónica exacta.',
      identityVerifiedSingleSource: 'Candidata con PPU, serie o chasis exacto verificado contra el maestro, pero respaldada por una sola fuente.',
      modelOnlyNeedsOperationalIdentity: 'La fuente identifica un modelo específico, pero falta PPU, serie, chasis o número de unidad para crear una Ficha 360 sin inferencia.',
      sourceCodeNeedsOperationalValidation: 'Existe un código interno estable en la fuente financiera, pero no es un identificador físico ni un ID Laudus verificado.',
      conflict: 'Un conflicto de identidad indica que una Ficha canónica existente y una fuente nueva discrepan en marca, modelo o configuración. No se crea otra Ficha 360 hasta resolverlo.',
      approval: 'Crear una Ficha 360 requiere revisión operacional; MOTIL conserva la fuente y no inventa campos faltantes.',
    },
  });
}


export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const key = text(body?.key);
  const decision = text(body?.decision);
  const note = text(body?.note);

  if (!key || !['accept', 'ignore', 'reopen'].includes(String(decision))) {
    return NextResponse.json({ error: 'Decisión inválida' }, { status: 400 });
  }

  const issueKey = 'asset_missing_candidate:' + key;
  const status =
    decision === 'accept' ? 'accepted' :
    decision === 'ignore' ? 'ignored' :
    'open';

  const resolutionNote =
    decision === 'accept'
      ? (note || 'Candidata aprobada para alta operacional. La Ficha 360 aún no ha sido creada.')
      : decision === 'ignore'
        ? (note || 'Candidata descartada para alta de Ficha 360.')
        : null;

  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await context.supabase
    .from('data_reconciliation_reviews')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('issue_key', issueKey)
    .maybeSingle();

  if (existingError) return NextResponse.json({ error: existingError.message }, { status: 500 });

  let result: any = null;
  if (existing?.id) {
    const { data, error } = await context.supabase
      .from('data_reconciliation_reviews')
      .update({
        status,
        resolution_note: resolutionNote,
        reviewed_by: context.userId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq('organization_id', context.organizationId)
      .eq('id', existing.id)
      .select('id,issue_key,status,resolution_note,reviewed_by,reviewed_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  } else {
    const { data, error } = await context.supabase
      .from('data_reconciliation_reviews')
      .insert({
        organization_id: context.organizationId,
        issue_key: issueKey,
        entity_type: 'asset',
        entity_id: null,
        issue_type: 'missing_canonical_asset_candidate',
        status,
        resolution_note: resolutionNote,
        evidence_reference: 'Revisión desde Finanzas · Candidatas Ficha 360',
        reviewed_by: context.userId,
        reviewed_at: now,
        created_at: now,
        updated_at: now,
      })
      .select('id,issue_key,status,resolution_note,reviewed_by,reviewed_at')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    result = data;
  }

  return NextResponse.json({ review: result });
}
