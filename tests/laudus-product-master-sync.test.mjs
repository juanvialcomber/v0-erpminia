import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = fs.readFileSync('lib/integrations/laudus/product-sync.ts', 'utf8');
const route = fs.readFileSync('app/api/cron/laudus-products-daily/route.ts', 'utf8');
const coreRoute = fs.readFileSync('app/api/cron/laudus-core-daily/route.ts', 'utf8');
const vercel = fs.readFileSync('vercel.json', 'utf8');
const proxy = fs.readFileSync('proxy.ts', 'utf8');

test('product sync reads the Laudus product list and stages through the existing reconciliation RPC', () => {
  assert.match(sync, /\/production\/products\/list/);
  assert.match(sync, /productId/);
  assert.match(sync, /SKU/);
  assert.match(sync, /description/);
  assert.match(sync, /unitOfMeasure/);
  assert.match(sync, /motil_ingest_laudus_products/);
  assert.match(sync, /PRODUCT_HEAD_PAGES_PER_RUN = 5/);
  assert.match(sync, /direction: 'DESC'/);
  assert.match(sync, /canonicalProductsMutated: false/);
  assert.match(sync, /laudusMutated: false/);
});

test('manual product sync is authenticated tenant-scoped and async', () => {
  assert.match(route, /getOrganizationContext\(request\)/);
  assert.match(route, /jefe_mantencion/);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /status: 'accepted'/);
  assert.match(route, /\{ status: 202 \}/);
});

test('product sync is consolidated before stock sync and remains public only at proxy level', () => {
  assert.match(vercel, /\/api\/cron\/laudus-core-daily/);
  assert.match(vercel, /20 5 \* \* \*/);
  assert.match(vercel, /10 \*\/6 \* \* \*/);
  assert.match(vercel, /\/api\/cron\/laudus-stock-daily/);
  assert.match(proxy, /'\/api\/cron\/laudus-products-daily'/);
  assert.match(proxy, /'\/api\/cron\/laudus-core-daily'/);
  assert.match(coreRoute, /syncLaudusProducts/);
  assert.match(coreRoute, /withLaudusApiUsageTracking/);
  assert.match(coreRoute, /CRON_SECRET/);
});

test('product sync updates control-plane health on start success and failure', () => {
  assert.match(sync, /markLaudusSyncRunning/);
  assert.match(sync, /markLaudusSyncSuccess/);
  assert.match(sync, /markLaudusSyncFailure/);
  assert.match(sync, /apiCalls/);
  assert.match(sync, /conflicts: conflict \+ newCandidate/);
});
