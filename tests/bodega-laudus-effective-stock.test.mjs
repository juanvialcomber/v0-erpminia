import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const helper = fs.readFileSync('lib/integrations/laudus/effective-stock.ts', 'utf8');
const stockRoute = fs.readFileSync('app/api/bodega/stock/route.ts', 'utf8');
const inventoryRoute = fs.readFileSync('app/api/bodega/inventory/route.ts', 'utf8');

test('effective Laudus stock is read-only and gated by source authority', () => {
  assert.match(helper, /bodega_stock_source_authority_service_v1/);
  assert.match(helper, /authorityState === 'laudus_primary'/);
  assert.match(helper, /laudus_inventory_reconciliation_service_v1/);
  assert.match(helper, /stockBySku/);
  assert.doesNotMatch(helper, /\.insert\(/);
  assert.doesNotMatch(helper, /\.update\(/);
  assert.doesNotMatch(helper, /\.delete\(/);
});

test('Bodega stock API uses Laudus quantity only when the authority helper returns it', () => {
  assert.match(stockRoute, /loadLaudusEffectiveStock/);
  assert.match(stockRoute, /effectiveStock\?\.isPrimary/);
  assert.match(stockRoute, /laudusQuantity \?\? Number\(row\.quantity \|\| 0\)/);
  assert.match(stockRoute, /laudusQuantity != null\s*\? quantityOnHand \* unitCost/);
  assert.match(stockRoute, /effectiveSource: effectiveStock\.isPrimary \? 'laudus' : 'motil'/);
});

test('Bodega inventory API exposes the effective Laudus quantity consistently', () => {
  assert.match(inventoryRoute, /loadLaudusEffectiveStock/);
  const effectiveQuantityUses = inventoryRoute.match(/effectiveQuantity \?\? toNumber\(item\.quantity\)/g) || [];
  assert.ok(effectiveQuantityUses.length >= 2);
  assert.match(inventoryRoute, /effective_source: effectiveQuantity != null \? 'laudus' : 'motil'/);
  assert.match(inventoryRoute, /effectiveSource: effectiveStock\.isPrimary \? 'laudus' : 'motil'/);
});
