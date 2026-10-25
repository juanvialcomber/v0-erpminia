import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Offline failure-contract regression: never contacts a live database.
const api = readFileSync(new URL('../app/api/maintenance/assets/[id]/economic-operational-history/route.ts', import.meta.url), 'utf8');
const view = readFileSync(new URL('../components/maintenance/asset-economic-operational-history.tsx', import.meta.url), 'utf8');

test('drilling error does not enter economic-history fatal source error', () => {
  const fatal = api.match(/const sourceError = ([^;]+);/);
  assert.ok(fatal, 'Source error aggregator missing');
  assert.doesNotMatch(fatal[1], /operationalReportsResult\.error/);
  assert.match(api, /drillingSourceUnavailable = Boolean\(operationalReportsResult\.error\)/);
});

test('drilling unavailability is explicit, not reported as zero observations', () => {
  assert.match(api, /drilling_source_status: drillingSourceUnavailable \? 'unavailable' : 'available'/);
  assert.match(view, /drillingUnavailable \? "Sin acceso a fuente"/);
  assert.match(view, /drillingUnavailable \? "Sin base"/);
});
