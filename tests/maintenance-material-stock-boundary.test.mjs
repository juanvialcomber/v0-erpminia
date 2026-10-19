import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const catalog = await readFile(new URL('../app/api/maintenance/material-catalog/route.ts', import.meta.url), 'utf8');
const coverage = await readFile(new URL('../components/maintenance/work-order-material-coverage.tsx', import.meta.url), 'utf8');

test('maintenance material catalog separates product identity informed stock and reservable stock', () => {
  assert.match(catalog, /canonical_products_v1/);
  assert.match(catalog, /bodega_inventory/);
  assert.match(catalog, /warehouse_stock/);
  assert.match(catalog, /informedQuantity/);
  assert.match(catalog, /reservableQuantity/);
  assert.match(catalog, /stockSignalSource/);
  assert.match(catalog, /reservationSource/);
});

test('La Patagua stock signal remains advisory and tenant identity remains canonical', () => {
  assert.match(catalog, /LA_PATAGUA_ORGANIZATION_ID/);
  assert.match(catalog, /eq\('organization_id', context\.organizationId\)/);
  assert.match(catalog, /stockSignal: context\.organizationId === LA_PATAGUA_ORGANIZATION_ID/);
});

test('material editor tells planner that availability and reservation are distinct', () => {
  assert.match(coverage, /Stock informado/);
  assert.match(coverage, /Reservable ahora/);
  assert.match(coverage, /La reserva real se confirma sólo al agregar el material a la OT/);
  assert.match(coverage, /Informado \{item\.informedQuantity/);
  assert.match(coverage, /Reservable \{item\.reservableQuantity/);
});
