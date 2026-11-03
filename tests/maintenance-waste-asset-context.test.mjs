import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../app/api/maintenance/waste/route.ts', import.meta.url), 'utf8');
const view = readFileSync(new URL('../components/maintenance/maintenance-waste-register.tsx', import.meta.url), 'utf8');

test('waste register derives machine context from canonical maintenance assets', () => {
  assert.match(api, /maintenance_canonical_assets_v1/);
  assert.match(api, /canonical_asset_id/);
  assert.match(api, /asset_code,name,asset_type,category,manufacturer,model,license_plate,cost_center_code,validation_status/);
  assert.match(api, /asset:/);
});

test('waste register exposes machine and site filters without copying asset identity', () => {
  assert.match(view, /Buscar equipo, OT o residuo/);
  assert.match(view, /Todas las ubicaciones/);
  assert.match(view, /row\.asset\?\.name/);
  assert.match(view, /row\.asset\?\.asset_code/);
  assert.match(view, /row\.asset\?\.manufacturer/);
  assert.match(view, /row\.asset\?\.model/);
  assert.match(view, /row\.work_order\?\.workshop_site/);
});

test('waste records remain operational records, not a second asset master', () => {
  assert.doesNotMatch(api, /from\('maintenance_waste_records'\)[\s\S]*insert\([\s\S]*(asset_code|manufacturer|model|license_plate)/);
});
