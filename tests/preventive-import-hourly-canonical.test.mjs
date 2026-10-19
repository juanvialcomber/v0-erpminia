import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(new URL('../app/api/maintenance/preventive/import/route.ts', import.meta.url), 'utf8');

test('preventive import requires maintenance write access', () => {
  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
});

test('preventive import accepts hour-only schedules without inventing calendar frequency', () => {
  assert.match(route, /\(frequencyHours \?\? 0\) > 0/);
  assert.match(route, /if \(!text\) return null/);
  assert.match(route, /frequency_days: row\.frequencyDays/);
  assert.match(route, /const nextScheduledDate = row\.frequencyDays && row\.frequencyDays > 0/);
  assert.match(route, /: row\.nextScheduledDate \|\| null/);
});

test('preventive import resolves active canonical assets while preserving legacy FK compatibility', () => {
  assert.match(route, /maintenance_canonical_assets_v1/);
  assert.match(route, /maintenance_assets/);
  assert.match(route, /legacyIds\.has\(asset\.id\)/);
  assert.match(route, /asset_id: assetId/);
  assert.match(route, /canonical_asset_id: assetId/);
});

test('preventive import preserves source file provenance and identity key includes hours', () => {
  assert.match(route, /source_reference: file\.name/);
  assert.match(route, /::d\$\{frequencyDays \?\? ''\}::h\$\{frequencyHours \?\? ''\}/);
});
