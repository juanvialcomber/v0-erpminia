import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile(new URL('../app/api/maintenance/import-assets/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/mantenimiento/equipos/page.tsx', import.meta.url), 'utf8');

test('asset imports require canonical maintenance write access', () => {
  assert.match(api, /MODULE_KEYS, requireModuleAccess/);
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
  assert.match(api, /if \(!access\.authorized\) return access\.response/);
});

test('equipment list only advertises asset import to verified editors', () => {
  assert.match(page, /const canManageAssets = ready && canEdit\('mant_operaciones'\)/);
  assert.match(page, /canManageAssets \? <Button asChild>/);
  assert.match(page, /canEdit=\{canManageAssets\}/);
});
