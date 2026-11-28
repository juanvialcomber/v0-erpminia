import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile(new URL('../app/api/maintenance/assets/route.ts', import.meta.url), 'utf8');

test('canonical maintenance assets require operational read access', () => {
  assert.match(api, /MODULE_KEYS, requireModuleAccess/);
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.match(api, /if \(!access\.authorized\) return access\.response/);
  assert.match(api, /from\('canonical_assets_current'\)/);
});
