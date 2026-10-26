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
  assert.match(page,/sin contraparte verificada/);
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
  assert.match(stage,/existingResolvedRows/);
  assert.match(stage,/resolvedIdentityBySource/);
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
