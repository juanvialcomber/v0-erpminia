import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('app/api/finance/asset-economics/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/finanzas/activos/page.tsx','utf8');
const nav=fs.readFileSync('app/dashboard/finanzas/layout.tsx','utf8');

test('asset economics queue uses canonical Daniel insurance and never converts UF to CLP',()=>{
  assert.match(api,/insured_asset_inventory/);
  assert.match(api,/fixed_asset_depreciation_model/);
  assert.match(api,/depreciationIdentityResult/);
  assert.match(api,/insured_uf/);
  assert.doesNotMatch(api,/ufToClp|uf_to_clp|exchangeRate|exchange_rate/);
  assert.match(api,/No se convierte a CLP/);
  assert.match(api,/Valor asegurado en UF/);
});

test('asset economics decisions remain deterministic and evidence bounded',()=>{
  assert.match(api,/maintenance_attention/);
  assert.match(api,/complete_economics/);
  assert.match(api,/complete_runtime/);
  assert.match(api,/No son diagnóstico de falla ni recomendación automática de reemplazo/);
  assert.match(api,/MOTIL no recomienda reemplazo hasta enlazar valor libro\/depreciación/);
});

test('finance assets workspace exposes evidence and links back to Ficha 360',()=>{
  assert.match(page,/Economía de activos/);
  assert.match(page,/evidencia \{row\.evidenceCoveragePct\}%/);
  assert.match(page,/dashboard\/mantenimiento\/equipos/);
  assert.match(page,/La cola de reemplazo se habilitará sólo cuando la depreciación de Daniel esté conciliada por activo/);
  assert.match(nav,/\/dashboard\/finanzas\/activos/);
});


test('asset 360 exposes canonical finance evidence without conflating insurance and book value',()=>{
  const route=fs.readFileSync('app/api/maintenance/assets/[id]/operational-360/route.ts','utf8');
  const overview=fs.readFileSync('components/maintenance/asset-360-overview.tsx','utf8');
  const economics=fs.readFileSync('components/maintenance/asset-360/economics-section.tsx','utf8');
  assert.match(route,/financeProfile/);
  assert.match(route,/insured_uf/);
  assert.match(route,/net_book_value/);
  assert.match(overview,/financeProfile=\{data\.financeProfile\}/);
  assert.match(economics,/Economía canónica del activo/);
  assert.match(economics,/Seguro, valor libro y depreciación son conceptos distintos/);
  assert.match(economics,/Pendiente de vincular/);
});


test('asset economics exposes book value only for single reconciled depreciation identity',()=>{
  assert.match(api,/depreciationRows\.length === 1/);
  assert.match(api,/depreciationConflictCount/);
  assert.match(api,/netBookValueClp/);
  assert.match(page,/Valor libro conciliado/);
  assert.match(page,/registros canónicos/);
});


test('asset economics reuses planning criticality and separates meter evidence from usable runtime',()=>{
  assert.match(api,/planning_maintenance_source_rows/);
  assert.match(api,/planning_asset_meter_readings/);
  assert.match(api,/distinctMeterValues >= 2/);
  assert.match(api,/distinctMeterDates >= 2/);
  assert.match(api,/meterDecreaseCount === 0/);
  assert.match(api,/withUsableRuntime/);
  assert.match(page,/Con medidor/);
  assert.match(page,/secuencia utilizable para tasas/);
});

test('incomplete economics message does not assume the asset came from insurance',()=>{
  assert.match(api,/Activo financiero vinculado, pero falta valor libro o costo\/fecha de adquisición canónica/);
  assert.doesNotMatch(api,/Seguro canónico vinculado, pero falta costo\/fecha/);
});


test('maintenance to book ratio is descriptive and never drives replacement',()=>{
  const economics=fs.readFileSync('components/maintenance/asset-360/economics-section.tsx','utf8');
  assert.match(api,/observedMaintenanceToBookPct/);
  assert.match(api,/recognizedCostLifetime \/ netBookValue/);
  assert.match(api,/no representa TCO ni dispara reemplazo/);
  assert.match(page,/Mantención reconocida:/);
  assert.match(economics,/Mantenimiento reconocido \/ valor libro/);
  assert.match(economics,/No representa TCO ni recomienda reemplazo/);
});


test('finance workbook reimport preserves exact asset identity without cost-center collisions',()=>{
  const stage=fs.readFileSync('app/api/finance/workbook-imports/[id]/stage/route.ts','utf8');
  assert.match(stage,/function normalizeExactCode/);
  assert.match(stage,/const costCenterPrefix = normalizeExactCode/);
  assert.match(stage,/const costCenterMap = uniqueExactTextMap/);
  assert.match(stage,/cost_center_code_exact/);
  assert.match(stage,/license_plate_embedded_exact/);
  assert.match(stage,/serial_embedded_exact/);
  assert.match(stage,/canonical_name_embedded_exact/);
  assert.doesNotMatch(stage,/costCenterPrefix = normalizeIdentifier/);
  assert.match(stage,/select\('id,name,serial_number,license_plate,cost_center_code'\)/);
});


test('asset economics bounds growing asset lookups to batches of 50',()=>{
  assert.match(api,/function chunkValues/);
  assert.match(api,/for \(const assetChunk of chunkValues\(assetIds, 50\)\)/);
  assert.match(api,/\.in\('id', assetChunk\)/);
  assert.match(api,/\.in\('canonical_asset_id', assetChunk\)/);
});


test('finance assets exposes unresolved reconciliation without fabricating identity',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/Sin identificador operacional/);
  assert.match(review,/Centro sin contraparte MOTIL/);
  assert.match(review,/Fuente: depreciado/);
  assert.match(review,/Fuente: vendido/);
  assert.match(review,/No implica error en la fuente/);
  assert.match(page,/Conciliación pendiente/);
  assert.match(page,/Depreciación/);
  assert.match(page,/Seguro sin clasificar/);
});


test('reconciliation review distinguishes canonical asset centers from non-asset centers',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/asset_center_without_asset/);
  assert.match(review,/non_asset_cost_center/);
  assert.match(review,/Centro de activo sin Ficha 360/);
  assert.match(review,/Centro no operacional/);
  assert.match(page,/Centro de activo sin Ficha 360/);
  assert.match(page,/Centro no operacional/);
});


test('financial asset register preserves the full Daniel source independently of Ficha 360',()=>{
  const api=fs.readFileSync('app/api/finance/asset-register/route.ts','utf8');
  const register=fs.readFileSync('app/dashboard/finanzas/activos/registro/page.tsx','utf8');
  assert.match(api,/Registro financiero completo de la fuente de Daniel/);
  assert.match(api,/PAGE_SIZE = 50/);
  assert.match(api,/status === 'linked'/);
  assert.match(api,/status === 'unresolved'/);
  assert.match(api,/status === 'conflict'/);
  assert.match(register,/Registro financiero/);
  assert.match(register,/Fuente completa de Daniel/);
  assert.match(page,/Registro financiero completo/);
});


test('financial register linked rows open their Asset 360',()=>{
  const register=fs.readFileSync('app/dashboard/finanzas/activos/registro/page.tsx','utf8');
  assert.match(register,/row\.canonical_asset_id/);
  assert.match(register,/dashboard\/mantenimiento\/equipos/);
  assert.match(register,/Abrir Ficha 360/);
});


test('workbook reimport preserves previously verified asset identities',()=>{
  const stage=fs.readFileSync('app/api/finance/workbook-imports/[id]/stage/route.ts','utf8');
  assert.match(stage,/existingStageRows/);
  assert.match(stage,/existingStageBySource/);
  assert.match(stage,/preserved_verified_identity/);
  assert.match(stage,/if \(row\.canonical_asset_id\) return row/);
});


test('reconciliation review prioritizes candidates for missing canonical Asset 360',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/missing_canonical_asset_candidate/);
  assert.match(review,/Posible Ficha 360 faltante/);
  assert.match(review,/no aparece en activos canónicos ni en alias operacionales verificados/);
  assert.match(page,/Ficha 360 faltante/);
});


test('reconciliation review separates ambiguous asset families from missing assets',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/ambiguous_existing_asset_family/);
  assert.match(review,/Unidad ambigua/);
  assert.match(review,/varias Fichas 360 son compatibles/);
  assert.match(page,/Unidad ambigua/);
});


test('reconciliation review classifies aggregate and insufficient identity rows',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/aggregate_multi_asset_financial_line/);
  assert.match(review,/Línea financiera agregada/);
  assert.match(review,/insufficient_unit_identity/);
  assert.match(review,/Identidad insuficiente/);
  assert.match(page,/Línea agregada/);
  assert.match(page,/Identidad insuficiente/);
});


test('workbook reimport preserves unresolved reconciliation metadata as well as verified identities',()=>{
  const stage=fs.readFileSync('app/api/finance/workbook-imports/[id]/stage/route.ts','utf8');
  assert.match(stage,/RECONCILIATION_PAYLOAD_KEYS/);
  assert.match(stage,/preservedReconciliationPayload/);
  assert.match(stage,/existingStageRows/);
  assert.match(stage,/reconciliation_disposition/);
  assert.match(stage,/reconciliation_scope/);
  assert.match(stage,/if \(!existing\.canonical_asset_id\)/);
});


test('reconciliation review separates unrepresented operational models',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/unrepresented_operational_model/);
  assert.match(review,/Modelo no representado/);
  assert.match(review,/no aparece en activos canónicos ni alias verificados/);
  assert.match(page,/Modelo no representado/);
});


test('insurance reimport preserves rich equipment description in the canonical stage row',()=>{
  const stage=fs.readFileSync('app/api/finance/workbook-imports/[id]/stage/route.ts','utf8');
  assert.match(stage,/description = textValue\(row\[1\]\)/);
  assert.match(stage,/if \(!description \|\| itemNumber < 1 \|\| itemNumber > 91\) continue/);
  assert.match(stage,/description,\n\s+equipment_type: equipmentType/);
  assert.match(stage,/source_kind: 'insured_asset_inventory',[\s\S]*description,/);
});


test('finance reconciliation summarizes insurance and depreciation without adding another review table',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/insured_asset_inventory/);
  assert.match(review,/insuranceSummary/);
  assert.match(review,/unclassifiedRows/);
  assert.match(page,/Depreciación/);
  assert.match(page,/Seguro sin clasificar/);
});


test('missing Asset 360 candidates are deduplicated across insurance and depreciation without auto-creation',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  assert.match(api,/missing_canonical_asset_candidate/);
  assert.match(api,/dualSource/);
  assert.match(api,/No crea una Ficha 360 automáticamente/);
  assert.match(candidates,/Candidatas Ficha 360/);
  assert.match(candidates,/Doble respaldo/);
  assert.match(candidates,/Nada se crea automáticamente/);
  assert.match(page,/Candidatas Ficha 360/);
});


test('finance reconciliation exposes material review completion while keeping low-value backlog visible',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/materialReviewComplete/);
  assert.match(review,/materialReviewFloorClp/);
  assert.match(review,/unexplainedOperationalBookValueClp/);
  assert.match(page,/Revisión ≥/);
  assert.match(page,/Revisión secundaria/);
});


test('finance reconciliation separates capitalized components from complete assets',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/component_or_spare_financial_line/);
  assert.match(review,/Componente \/ repuesto/);
  assert.match(review,/no un activo operacional completo/);
  assert.match(page,/Componente \/ repuesto/);
});


test('finance reconciliation keeps sub-threshold operational rows visible as secondary review',()=>{
  const review=fs.readFileSync('app/api/finance/asset-reconciliation-review/route.ts','utf8');
  assert.match(review,/low_materiality_secondary_review/);
  assert.match(review,/Revisión secundaria/);
  assert.match(review,/CLP 100\.000/);
  assert.match(page,/low_materiality_secondary_review/);
  assert.match(page,/preservados bajo el umbral material actual/);
});


test('ready asset candidates are prioritized and survive workbook reimport',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  const stage=fs.readFileSync('app/api/finance/workbook-imports/[id]/stage/route.ts','utf8');
  assert.match(api,/readyForReview/);
  assert.match(api,/ready_for_asset_review/);
  assert.match(api,/candidate_review_source_count/);
  assert.match(candidates,/Lista para revisión/);
  assert.match(candidates,/sin contraparte canónica exacta/i);
  assert.match(stage,/candidate_review_status/);
  assert.match(stage,/candidate_review_basis/);
  assert.match(stage,/candidate_review_source_count/);
  assert.match(stage,/candidate_review_verified_at/);
});


test('finance candidates keep single-source exact identities below dual-source review tier',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  assert.match(api,/identityVerifiedSingleSource/);
  assert.match(api,/identity_verified_single_source/);
  assert.match(api,/PPU, serie o chasis exacto verificado/);
  assert.match(candidates,/Identidad exacta · 1 fuente/);
  assert.match(candidates,/falta segunda fuente o validación operacional/);
});


test('finance candidate queue classifies every review tier explicitly',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  assert.match(api,/modelOnlyNeedsOperationalIdentity/);
  assert.match(api,/sourceCodeNeedsOperationalValidation/);
  assert.match(api,/model_only_needs_operational_identity/);
  assert.match(api,/source_code_needs_operational_validation/);
  assert.match(candidates,/Falta identidad operacional/);
  assert.match(candidates,/Código fuente por validar/);
  assert.match(candidates,/Conflictos/);
});


test('ready Asset 360 candidates use auditable review decisions without creating assets',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  assert.match(api,/data_reconciliation_reviews/);
  assert.match(api,/missing_canonical_asset_candidate/);
  assert.match(api,/accepted/);
  assert.match(api,/ignored/);
  assert.match(api,/reviewed_by: context\.userId/);
  assert.match(api,/La Ficha 360 aún no ha sido creada/);
  assert.match(candidates,/Aprobar para alta/);
  assert.match(candidates,/No corresponde/);
  assert.match(candidates,/Reabrir/);
});


test('finance summary surfaces the Asset 360 review queue without mixing it into Laudus control',()=>{
  const dashboard=fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
  const signal=fs.readFileSync('components/finance/asset-candidate-review-signal.tsx','utf8');
  assert.match(dashboard,/AssetCandidateReviewSignal/);
  assert.match(signal,/Fichas 360 por revisar/);
  assert.match(signal,/altas por decidir/);
  assert.match(signal,/Revisar candidatas/);
  assert.match(signal,/\/dashboard\/finanzas\/activos\/candidatas/);
});


test('Asset 360 candidate draft exposes verified fields and blocks canonical creation prerequisites',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  assert.match(api,/canonicalDraft/);
  assert.match(api,/requiredBeforeCreation: \['asset_code', 'canonical_import_batch'\]/);
  assert.match(api,/No se crea la Ficha 360 hasta asignar código de activo y lineage canónico aprobado/);
  assert.match(candidates,/Borrador de alta/);
  assert.match(candidates,/Falta código de activo y lote canónico aprobado/);
  assert.match(candidates,/la Ficha 360 no se crea desde esta pantalla/i);
  assert.match(candidates,/sourceFile/);
});


test('Asset 360 review summary counts only pending decisions as actionable',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const signal=fs.readFileSync('components/finance/asset-candidate-review-signal.tsx','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  assert.match(api,/pendingReview/);
  assert.match(api,/acceptedForCreation/);
  assert.match(api,/ignoredCandidates/);
  assert.match(signal,/pendingReview/);
  assert.match(signal,/altas por decidir/);
  assert.match(candidates,/Por decidir/);
  assert.match(candidates,/readyDualFinance/);
  assert.match(candidates,/readyPurchaseEvidence/);
  assert.match(candidates,/seguro\+depreciación/);
  assert.match(candidates,/PPU\+Compras/);
});


test('finance separates canonical identity conflicts from new Asset 360 candidates',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  const signal=fs.readFileSync('components/finance/asset-candidate-review-signal.tsx','utf8');
  assert.match(api,/canonical_identity_source_conflict/);
  assert.match(api,/openIdentityConflicts/);
  assert.match(api,/identityConflicts/);
  assert.match(candidates,/Conflictos de identidad/);
  assert.match(candidates,/No se crea un activo nuevo hasta resolver el conflicto/);
  assert.match(signal,/conflictos/);
});


test('Asset 360 candidate review surfaces material identity blockers before low-value queue detail',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  assert.match(api,/candidateBookValueClp/);
  assert.match(api,/modelOnlyBookValueClp/);
  assert.match(api,/sumBookValue/);
  assert.match(candidates,/Mayor impacto pendiente/);
  assert.match(candidates,/modelOnlyBookValueClp/);
  assert.match(candidates,/No se infiere la identidad/);
});


test('finance summary keeps material model-only asset blockers visible',()=>{
  const signal=fs.readFileSync('components/finance/asset-candidate-review-signal.tsx','utf8');
  assert.match(signal,/modelOnlyBookValueClp/);
  assert.match(signal,/modelOnly===0/);
  assert.match(signal,/modelos por identificar/);
  assert.match(signal,/compactMoney\(modelOnlyBookValue\)/);
});


test('ready Asset 360 reviews distinguish finance dual-source from purchase operational evidence',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  assert.match(api,/purchaseCostCenterEvidence/);
  assert.match(api,/readyDualFinance/);
  assert.match(api,/readyPurchaseEvidence/);
  assert.match(api,/exact_plate_plus_purchase_cost_center/);
  assert.match(candidates,/Primero evidencia cruzada/);
  assert.match(candidates,/PPU exacta \+ centro de costo en Compras/);
  assert.match(candidates,/Evidencia exacta en seguro \+ depreciación/);
  assert.match(candidates,/Compras:/);
});


test('Asset 360 draft derives vehicle type only from explicit source wording when structured type is missing',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  assert.match(api,/normalizedTitle/);
  assert.match(api,/typeEvidence/);
  assert.match(api,/CAMIONETAS/);
  assert.match(api,/CAMIONES/);
  assert.match(api,/camioneta\|camión\|camion/);
});


test('ready Asset 360 reviews distinguish purchase cost-center and purchase-description evidence',()=>{
  const api=fs.readFileSync('app/api/finance/missing-asset-candidates/route.ts','utf8');
  const candidates=fs.readFileSync('app/dashboard/finanzas/activos/candidatas/page.tsx','utf8');
  assert.match(api,/purchaseDescriptionExactPlate/);
  assert.match(api,/readyPurchaseCostCenter/);
  assert.match(api,/readyPurchaseDescription/);
  assert.match(api,/exact_plate_plus_purchase_description/);
  assert.match(candidates,/centro de costo en Compras/);
  assert.match(candidates,/PPU exacta en orden de compra/);
  assert.match(candidates,/orden Compras/);
});
