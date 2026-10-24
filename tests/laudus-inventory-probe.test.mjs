import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/integrations/laudus/client.ts', import.meta.url), 'utf8');
const probe = readFileSync(new URL('../app/api/integrations/laudus/inventory-probe/route.ts', import.meta.url), 'utf8');

test('inventory reads use official Laudus GET endpoints', () => {
  assert.match(client, /production\/products\/stock/);
  assert.match(client, /production\/products\/\$\{productId\}\/stock/);
  assert.match(client, /production\/products\/\$\{productId\}\/stockByWarehouses/);
  assert.match(client, /production\/products\/\$\{productId\}\/kardex/);
  assert.match(client, /method: 'GET'/);
});

test('inventory probe is low-cost, shape-only, and non-persistent', () => {
  assert.match(client, /runLaudusInventoryReadOnlyProbe/);
  assert.match(client, /calls: 3/);
  assert.match(client, /describeLaudusPayloadShape/);
  assert.match(client, /persisted: false/);
  assert.doesNotMatch(probe, /source_payload|\.insert\(|\.upsert\(|\.update\(|\.delete\(/);
});

test('temporary inventory probe is preview branch only', () => {
  assert.match(probe, /VERCEL_ENV === 'preview'/);
  assert.match(probe, /VERCEL_GIT_COMMIT_REF === 'feat\/laudus-inventory-discovery-20261023'/);
  assert.match(probe, /runLaudusInventoryReadOnlyProbe\(1\)/);
});
