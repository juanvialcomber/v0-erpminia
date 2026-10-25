import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const matrix = fs.readFileSync('lib/integrations/laudus/capability-matrix.ts','utf8');
const route = fs.readFileSync('app/api/integrations/laudus/capabilities/route.ts','utf8');

test('Laudus capability matrix only reads the fixed Laudus host', () => {
  assert.match(matrix, /https:\/\/api\.laudus\.cl/);
  assert.match(matrix, /hostname === 'api\.laudus\.cl'/);
  assert.doesNotMatch(matrix, /process\.env\.LAUDUS_PASSWORD/);
});

test('Laudus capability matrix separates API availability from MOTIL readiness', () => {
  assert.match(matrix, /connector_ready/);
  assert.match(matrix, /available/);
  assert.match(matrix, /evaluate/);
  assert.match(matrix, /READY_PATHS/);
});

test('capabilities endpoint is finance-authorized and read only', () => {
  assert.match(route, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /POST|PUT|PATCH|DELETE/);
});


test('current Laudus Swagger v2 is preferred', () => {
  assert.match(matrix, /\/swagger\/v2\/swagger\.json/);
});

test('POST list endpoints are discovery reads, not business mutations', () => {
  const discovery = fs.readFileSync('lib/integrations/laudus/openapi-discovery.ts','utf8');
  assert.match(discovery, /method === 'post' && \/\\\/list/);
  assert.match(discovery, /isMutatingMethod/);
});
