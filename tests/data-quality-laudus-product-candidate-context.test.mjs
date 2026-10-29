import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/data-quality/reconciliation/route.ts', import.meta.url);

test('data quality enriches Laudus product candidates without creating masters', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /from\('laudus_products'\)/);
  assert.match(route, /from\('laudus_product_stock'\)/);
  assert.match(route, /from\('laudus_warehouses'\)/);
  assert.match(route, /Laudus producto ·/);
  assert.match(route, /Posiciones Laudus más recientes por bodega/);
  assert.match(route, /no modifica ni crea el maestro automáticamente/);
  assert.match(route, /productCandidateIds/);
  assert.match(route, /latestPositions/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
});

test('candidate stock context remains warehouse-specific instead of mixed-unit aggregation', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /warehouseCode/);
  assert.match(route, /warehouseName/);
  assert.match(route, /unit_of_measure/);
  assert.doesNotMatch(route, /reduce\([^\n]*stock/i);
});
