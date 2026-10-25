import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/integrations/laudus/client.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/value-probe/route.ts', import.meta.url), 'utf8');

test('Laudus value probe is bounded, redacted and read only', () => {
  assert.match(client, /runLaudusReadOnlyValueProbe/);
  assert.match(client, /limit: 1/);
  assert.match(client, /redacted: true/);
  assert.match(client, /sampleFields/);
  assert.match(client, /purchases\/invoices\/list/);
  assert.match(client, /accounting\/bankStatements\/list/);
  assert.match(client, /purchases\/fixedAssets\/list/);
  assert.match(client, /production\/inventories\/list/);
  assert.doesNotMatch(client, /method: 'PUT'|method: 'DELETE'|method: 'PATCH'/);
});

test('value probe is admin scoped and never persists source rows', () => {
  assert.match(route, /resolveDataHealthAccess/);
  assert.match(route, /access\.admin/);
  assert.match(route, /persisted: false/);
  assert.doesNotMatch(route, /insert\(|update\(|upsert\(|delete\(/);
});
