import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile(new URL('../app/api/bodega/import-cost-centers/route.ts', import.meta.url), 'utf8');
const layout = await readFile(new URL('../app/dashboard/bodega/layout.tsx', import.meta.url), 'utf8');

test('cost-center imports require canonical Bodega write access', () => {
  assert.match(api, /MODULE_KEYS, requireModuleAccess/);
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.BODEGA_INVENTARIO, true\)/);
  assert.match(api, /if \(!access\.authorized\) return access\.response/);
});

test('Bodega only advertises import tooling to verified editors', () => {
  assert.match(layout, /item\.href !== '\/dashboard\/bodega\/importar-datos' \|\| \(ready && canEdit\('bodega_inventario'\)\)/);
});
