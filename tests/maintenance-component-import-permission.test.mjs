import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile(new URL('../app/api/maintenance/componentes-mayores/import/route.ts', import.meta.url), 'utf8');
const board = await readFile(new URL('../components/maintenance/componentes-mayores-board.tsx', import.meta.url), 'utf8');

test('major component imports require canonical maintenance write access', () => {
  assert.match(api, /MODULE_KEYS, requireModuleAccess/);
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
  assert.match(api, /if \(!access\.authorized\) return access\.response/);
});

test('component board only advertises import tooling to verified editors', () => {
  assert.match(board, /const canManageComponents = ready && canEdit\('mant_operaciones'\)/);
  assert.match(board, /canManageComponents \? <Button asChild/);
});
