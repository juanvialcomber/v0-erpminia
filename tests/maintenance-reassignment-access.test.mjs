import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const detailRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url), 'utf8');
const timerRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url), 'utf8');

test('mechanic ED matrix does not bypass assigned executor boundary after reassignment', () => {
  assert.match(detailRoute, /const isExecutionRole = context\.role === 'tecnico'/);
  assert.match(detailRoute, /accessLevel === 'ED' && !isExecutionRole/);
  assert.match(detailRoute, /const hasModuleWrite = accessLevel === 'ED' && context\.role !== 'tecnico'/);
  assert.match(timerRoute, /accessLevel !== 'ED' \|\| context\.role === 'tecnico'/);
  assert.match(timerRoute, /accessLevel === 'ED' && context\.role !== 'tecnico'/);
});
