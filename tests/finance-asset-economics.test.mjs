import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('app/api/finance/asset-economics/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/finanzas/activos/page.tsx','utf8');
const nav=fs.readFileSync('app/dashboard/finanzas/layout.tsx','utf8');

test('asset economics queue uses canonical Daniel insurance and never converts UF to CLP',()=>{
  assert.match(api,/source_kind', 'insured_asset_inventory'/);
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
