import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const helper = await readFile(new URL('../lib/bodega-operational-stock.ts', import.meta.url), 'utf8');
const inventoryRoute = await readFile(new URL('../app/api/bodega/inventory/route.ts', import.meta.url), 'utf8');
const stockRoute = await readFile(new URL('../app/api/bodega/stock/route.ts', import.meta.url), 'utf8');
const alerts = await readFile(new URL('../lib/api/inventory-stock-alerts.ts', import.meta.url), 'utf8');

test('bodega operational quantity resolver reads the Laudus-resolved service by canonical product id', () => {
  assert.match(helper, /bodega_inventory_operational_service_v1/);
  assert.match(helper, /canonical_product_id/);
  assert.match(helper, /operational_quantity/);
  assert.match(helper, /resolvedOperationalQuantity/);
});

test('inventory API overlays canonical catalog with operational stock', () => {
  assert.match(inventoryRoute, /loadBodegaOperationalQuantities/);
  assert.match(inventoryRoute, /resolvedOperationalQuantity/);
  assert.match(inventoryRoute, /stockAuthority: 'bodega_inventory_operational_service_v1'/);
  assert.match(inventoryRoute, /stock_source: operational\.has\(item\.id\) \? 'operational' : 'canonical'/);
});

test('stock summary uses operational quantity and keeps monetary output explicitly untrusted', () => {
  assert.match(stockRoute, /resolvedOperationalQuantity\(row\.quantity, operational\.get\(row\.id\)\)/);
  assert.match(stockRoute, /operationalRow\s*\? quantityOnHand \* unitCost/);
  assert.match(stockRoute, /dataSource: 'canonical\+operational'/);
  assert.match(stockRoute, /valuation_trusted: false/);
  assert.match(stockRoute, /valuation_state: 'review'/);
  assert.match(stockRoute, /Los costos unitarios de Bodega siguen pendientes de conciliación completa/);
  assert.doesNotMatch(stockRoute, /unitCost\s*=\s*Number\(operational/);
});

test('reorder alerts evaluate operational quantities rather than stale canonical quantity', () => {
  assert.match(alerts, /loadBodegaOperationalQuantities/);
  assert.match(alerts, /resolvedOperationalQuantity/);
  assert.match(alerts, /isStockBelowMinimum\(quantity, row\.min_stock\)/);
});
