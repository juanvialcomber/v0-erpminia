import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const inventory = await readFile(new URL('../app/api/bodega/inventory/route.ts', import.meta.url), 'utf8');
const stock = await readFile(new URL('../app/api/bodega/stock/route.ts', import.meta.url), 'utf8');

test('bodega inventory uses Laudus operational read model only when authority says laudus_primary', () => {
  assert.match(inventory, /bodega_stock_source_authority_service_v1/);
  assert.match(inventory, /authority_state === 'laudus_primary'/);
  assert.match(inventory, /bodega_inventory_operational_service_v1/);
  assert.match(inventory, /neq\('reconciliation_state', 'laudus_only_zero'\)/);
  assert.match(inventory, /dataSource: 'laudus_operational'/);
});

test('Laudus-only current stock is visible but remains read-only and non-canonical', () => {
  assert.match(inventory, /sourceOnly = !row\.canonical_product_id/);
  assert.match(inventory, /readOnly: sourceOnly/);
  assert.match(inventory, /source: 'laudus'/);
  assert.match(inventory, /laudus:\$\{row\.laudus_product_external_id/);
  assert.doesNotMatch(inventory, /insert\([\s\S]*canonical_inventory_current/);
});

test('stock summary includes operational source-only rows without promoting them', () => {
  assert.match(stock, /bodega_inventory_operational_service_v1/);
  assert.match(stock, /source_only_count/);
  assert.match(stock, /source_only: sourceOnly/);
  assert.match(stock, /read_only: sourceOnly/);
  assert.match(stock, /stockSource: 'laudus_operational'/);
  assert.match(stock, /neq\('reconciliation_state', 'laudus_only_zero'\)/);
});

test('canonical metadata enrichment is bounded and fallback remains available', () => {
  assert.match(inventory, /i \+= 50/);
  assert.match(inventory, /dataSource: 'canonical_fallback'/);
  assert.match(stock, /stockSource: 'canonical_fallback'/);
});
