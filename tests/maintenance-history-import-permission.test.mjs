import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile(new URL('../app/api/maintenance/history/import/route.ts', import.meta.url), 'utf8');

test('maintenance history imports require canonical write access', () => {
  assert.match(api, /MODULE_KEYS, requireModuleAccess/);
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
  assert.match(api, /if \(!access\.authorized\) return access\.response/);
});
