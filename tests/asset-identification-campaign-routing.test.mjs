import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql = fs.readFileSync('supabase/migrations/20261108153500_route_asset_identity_campaign_to_bodega.sql','utf8');

test('routes one aggregated physical asset identity campaign without mutating canonical data', () => {
  assert.match(sql,/operational_tasks_by_cargo_v10/);
  assert.match(sql,/asset-identification-campaign:bodega/);
  assert.match(sql,/JEFE BODEGA/);
  assert.match(sql,/asset_candidate_missing_unit_identifier/);
  assert.match(sql,/capture_asset_identity_in_bodega/);
  assert.match(sql,/No modificar stock ni crear Fichas 360 automáticamente/);
  assert.doesNotMatch(sql,/update\s+canonical\./i);
  assert.doesNotMatch(sql,/update\s+integration\.laudus_product_stock/i);
});

test('keeps maintenance as support instead of duplicate owner', () => {
  assert.match(sql,/asset-identification-campaign:maintenance-support/);
  assert.match(sql,/JEFE DEPARTAMENTO DE MANTENIMIENTO/);
  assert.match(sql,/'support'::text as responsibility/);
});
