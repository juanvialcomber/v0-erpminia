import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/integrations/laudus/client.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/smoke/route.ts', import.meta.url), 'utf8');

test('Laudus client keeps credentials server-side and requires all three login values', () => {
  assert.match(client, /LAUDUS_USER_NAME/);
  assert.match(client, /LAUDUS_PASSWORD/);
  assert.match(client, /LAUDUS_COMPANY_VAT_ID/);
  assert.doesNotMatch(client, /NEXT_PUBLIC_/);
});

test('Laudus login uses the current v2 contract and caches the token', () => {
  assert.match(client, /\/security\/login/);
  assert.match(client, /userName, password, companyVATId/);
  assert.match(client, /expiration/);
  assert.match(client, /tokenCache/);
});

test('smoke test is bounded to five low-cost read-only calls', () => {
  assert.match(client, /limit: 5/);
  assert.match(client, /calls: 5/);
  assert.match(client, /production\/products\/list/);
  assert.match(client, /purchases\/suppliers\/list/);
  assert.match(client, /production\/warehouses\/list/);
  assert.match(client, /purchases\/costcenters\/list/);
  assert.doesNotMatch(client, /method: 'PUT'|method: 'DELETE'|method: 'PATCH'/);
});

test('smoke endpoint fails closed before any call when secrets are absent', () => {
  assert.match(route, /pending_configuration/);
  assert.match(route, /calls: 0/);
  assert.match(route, /persisted: false/);
});

test('smoke endpoint is admin scoped and never persists data', () => {
  assert.match(route, /resolveDataHealthAccess/);
  assert.match(route, /access\.admin/);
  assert.match(route, /persisted: false/);
  assert.doesNotMatch(route, /insert\(|update\(|upsert\(|delete\(/);
});
