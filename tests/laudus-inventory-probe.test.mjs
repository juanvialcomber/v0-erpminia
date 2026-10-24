import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/integrations/laudus/client.ts', import.meta.url), 'utf8');
const inventory = readFileSync(new URL('../lib/integrations/laudus/inventory.ts', import.meta.url), 'utf8');

test('inventory reads use official Laudus GET endpoints', () => {
  assert.match(client, /production\/products\/stock/);
  assert.match(client, /production\/products\/\$\{productId\}\/stock/);
  assert.match(client, /production\/products\/\$\{productId\}\/stockByWarehouses/);
  assert.match(client, /production\/products\/\$\{productId\}\/kardex/);
  assert.match(client, /method: 'GET'/);
});

test('inventory probe stays low-cost and non-persistent', () => {
  assert.match(client, /runLaudusInventoryReadOnlyProbe/);
  assert.match(client, /calls: 3/);
  assert.match(client, /describeLaudusPayloadShape/);
  assert.match(client, /persisted: false/);
});

test('stock normalizer uses the documented StockListDto contract', () => {
  assert.match(inventory, /root\.products/);
  assert.match(inventory, /row\.productId/);
  assert.match(inventory, /row\.sku/);
  assert.match(inventory, /row\.stock/);
  assert.match(inventory, /parsed\.warehouseId !== warehouseId/);
});

test('stock staging is bounded to database batches of at most 500', () => {
  assert.match(inventory, /size > 500/);
  assert.match(inventory, /rows\.slice\(index, index \+ size\)/);
});
