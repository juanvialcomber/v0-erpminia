import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const migration=fs.readFileSync('supabase/migrations/20261024000500_asset_laudus_parts_preview.sql','utf8');
const route=fs.readFileSync('app/api/maintenance/assets/[id]/supply-economics/route.ts','utf8');
const component=fs.readFileSync('components/maintenance/asset-supply-economics.tsx','utf8');
const page=fs.readFileSync('app/dashboard/mantenimiento/equipos/[id]/ficha/page.tsx','utf8');
test('Asset economics bridges Laudus only through traced parts',()=>{
  assert.match(migration,/public\.work_order_parts/);
  assert.match(migration,/integration\.laudus_purchase_order_lines/);
  assert.match(migration,/laudus_purchase_is_asset_consumption/);
  assert.match(migration,/no_repair_replace_recommendation_without_evidence/);
  assert.match(route,/motil_asset_laudus_parts_preview/);
  assert.match(component,/Economía de repuestos aún no trazable/);
  assert.match(component,/compras Laudus por centro de costo ni por similitud de texto/);
  assert.match(page,/AssetSupplyEconomics/);
});