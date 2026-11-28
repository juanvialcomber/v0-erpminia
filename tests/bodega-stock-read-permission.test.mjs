import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile(new URL('../app/api/bodega/stock/route.ts', import.meta.url), 'utf8');

test('Bodega stock summary requires canonical inventory read access', () => {
  assert.match(api, /MODULE_KEYS, requireModuleAccess/);
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.BODEGA_INVENTARIO\)/);
  assert.match(api, /if \(!access\.authorized\) return access\.response/);
  assert.match(api, /getOrganizationContext\(request\)/);
  assert.match(api, /from\('warehouse_stock'\)/);
});
