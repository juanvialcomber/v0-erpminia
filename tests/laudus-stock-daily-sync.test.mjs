import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/stock-sync.ts', import.meta.url), 'utf8');
const client = readFileSync(new URL('../lib/integrations/laudus/client.ts', import.meta.url), 'utf8');
const inventory = readFileSync(new URL('../lib/integrations/laudus/inventory.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/cron/laudus-stock-daily/route.ts', import.meta.url), 'utf8');
const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

test('daily Laudus stock sync uses verified read-only endpoint', () => {
  assert.match(client, /getLaudus\('\/production\/products\/stock'/);
  assert.match(client, /method: 'GET'/);
  assert.match(helper, /getLaudusStockSnapshot/);
  assert.match(helper, /canonicalInventoryMutated: false/);
  assert.match(helper, /laudusMutated: false/);
});

test('daily stock sync retries only transient Laudus failures with a hard attempt cap', () => {
  assert.match(helper, /retryPolicy\(error\.status, attempt\)/);
  assert.match(helper, /attempt < 3/);
  assert.match(helper, /attempt === 2/);
});

test('daily stock sync reads only physical warehouses before staging', () => {
  const readPhase = helper.indexOf('const snapshots: Snapshot[]');
  const stagePhase = helper.indexOf("motil_ingest_laudus_product_stock");
  assert.ok(readPhase >= 0 && stagePhase > readPhase);
  assert.match(helper, /physicalWarehouseIds/);
  assert.match(helper, /'001', '002', '003', '004'/);
  assert.match(helper, /Read every physical warehouse before staging anything/);
});

test('daily stock sync batches staging at 500 and finalizes last non-empty batch', () => {
  assert.match(inventory, /size > 500/);
  assert.match(helper, /chunkLaudusStockRows\(snapshot\.rows, 500\)/);
  assert.match(helper, /const isLastBatch = index === batches\.length - 1/);
  assert.match(helper, /p_finalize: isLastBatch/);
});

test('failed staging marks its integration run failed without canonical mutation', () => {
  assert.match(helper, /schema\('integration'\)/);
  assert.match(helper, /status: 'failed'/);
  assert.doesNotMatch(helper, /warehouse_stock.*(?:insert|update|upsert|delete)/s);
});

test('stock cron is secret protected, public only through its own guard, and scheduled every six hours', () => {
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /syncLaudusStockDaily/);
  assert.match(proxy, /\/api\/cron\/laudus-stock-daily/);
  const config = JSON.parse(vercel);
  assert.ok(config.crons.some((cron) =>
    cron.path === '/api/cron/laudus-stock-daily' && cron.schedule === '10 */6 * * *'
  ));
});
