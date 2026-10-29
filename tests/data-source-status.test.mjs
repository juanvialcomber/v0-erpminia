import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/data-sources/status/route.ts', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../hooks/use-data-source-status.ts', import.meta.url), 'utf8');

test('source status is organization-scoped and Laudus reads the safe public service view', () => {
  assert.match(route, /getOrganizationContext/);
  assert.match(route, /eq\('organization_id', org\)/);
  assert.match(route, /laudus_source_status_service_v1/);
  assert.doesNotMatch(route, /schema\('integration'\)/);
});

test('Laudus connection state derives from the latest real sync status instead of a hardcoded pending state', () => {
  for (const status of ['running', 'queued', 'failed', 'partial', 'completed']) {
    assert.match(route, new RegExp("'" + status + "'"));
  }
  assert.match(route, /Conectado · última sincronización completada/);
  assert.match(route, /state: 'updated'/);
  assert.doesNotMatch(route, /Pendiente de habilitación comercial de API/);
});

test('clients share one source-status contract and degrade honestly', () => {
  assert.match(hook, /\/api\/data-sources\/status/);
  assert.match(hook, /state: 'review'/);
  assert.doesNotMatch(hook, /state: 'updated'.*catch/s);
});
