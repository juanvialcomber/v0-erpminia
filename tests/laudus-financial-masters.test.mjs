import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(
  new URL('../app/api/integrations/laudus/financial-masters/sync/route.ts', import.meta.url),
  'utf8',
);
const parser = readFileSync(
  new URL('../lib/integrations/laudus/financial-masters.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../supabase/migrations/20261024030000_laudus_financial_masters.sql', import.meta.url),
  'utf8',
);

test('financial master sync is admin-only and read-only upstream', () => {
  assert.match(route, /resolveDataHealthAccess/);
  assert.match(route, /!access\.admin/);
  assert.match(route, /\/purchases\/costcenters\/list/);
  assert.match(route, /\/purchases\/fixedAssets\/list/);
  assert.doesNotMatch(route, /method:\s*['"]PUT['"]/);
  assert.doesNotMatch(route, /method:\s*['"]DELETE['"]/);
  assert.doesNotMatch(route, /method:\s*['"]PATCH['"]/);
});

test('financial master list parsing is bounded and shape-safe', () => {
  assert.match(parser, /\['data', 'items', 'results', 'rows'\]/);
  assert.match(route, /PAGE_SIZE = 25/);
  assert.match(route, /MAX_PAGES = 200/);
});

test('financial master staging never mutates canonical entities', () => {
  assert.match(migration, /integration\.laudus_cost_centers/);
  assert.match(migration, /integration\.laudus_fixed_assets/);
  assert.match(migration, /canonical_mutated/);
  assert.doesNotMatch(migration, /insert into canonical\.assets/i);
  assert.doesNotMatch(migration, /update canonical\.assets/i);
  assert.doesNotMatch(migration, /insert into canonical\.cost_centers/i);
  assert.doesNotMatch(migration, /update canonical\.cost_centers/i);
});

test('asset identity only auto-matches on exact serial number', () => {
  assert.match(migration, /serial_number/);
  assert.match(migration, /lower\(trim\(serial_number\)\)/);
  assert.match(migration, /v_asset_matches=1/);
});
