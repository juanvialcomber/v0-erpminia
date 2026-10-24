import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/data-sources/status/route.ts', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../hooks/use-data-source-status.ts', import.meta.url), 'utf8');

test('source status is organization-scoped and Laudus remains optional before activation', () => {
  assert.match(route, /getOrganizationContext/);
  assert.match(route, /eq\('organization_id', org\)/);
  assert.match(route, /schema\('integration'\)/);
  assert.match(route, /integration schema may not be deployed yet/i);
});

test('Laudus UI state derives from sync runs and reconciliation instead of a hardcoded enabled state', () => {
  for (const status of ['running', 'queued', 'failed', 'partial', 'completed']) {
    assert.match(route, new RegExp("'" + status + "'"));
  }
  assert.match(route, /motil_get_laudus_inventory_reconciliation_summary/);
  assert.match(route, /reviewCount/);
  assert.doesNotMatch(route, /from\('reconciliation_items'\)/);
});

test('clients share one source-status contract and degrade honestly', () => {
  assert.match(hook, /\/api\/data-sources\/status/);
  assert.match(hook, /state: 'review'/);
  assert.doesNotMatch(hook, /state: 'updated'.*catch/s);
});
