import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const helper = await readFile(new URL('../lib/maintenance/work-order-execution-access.ts', import.meta.url), 'utf8');
const detailRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url), 'utf8');
const timerRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url), 'utf8');
const evidenceRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/evidence/route.ts', import.meta.url), 'utf8');
const runtimeRoute = await readFile(new URL('../app/api/maintenance/work-order-runtime-evidence/route.ts', import.meta.url), 'utf8');
const wasteRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/waste/route.ts', import.meta.url), 'utf8');
const offlineRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/offline-notes/route.ts', import.meta.url), 'utf8');
const planRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/standard-plan/route.ts', import.meta.url), 'utf8');
const closeQueueRoute = await readFile(new URL('../app/api/maintenance/work-order-close-queue/route.ts', import.meta.url), 'utf8');
const executionRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/execution/route.ts', import.meta.url), 'utf8');

test('mechanic ED matrix does not bypass assigned executor boundary after reassignment', () => {
  assert.match(helper, /accessLevel === 'ED' && context\.role !== 'tecnico'/);
  assert.match(detailRoute, /const isExecutionRole = context\.role === 'tecnico'/);
  assert.match(detailRoute, /accessLevel === 'ED' && !isExecutionRole/);
  assert.match(detailRoute, /const hasModuleWrite = accessLevel === 'ED' && context\.role !== 'tecnico'/);
  assert.match(timerRoute, /accessLevel !== 'ED' \|\| context\.role === 'tecnico'/);
  assert.match(timerRoute, /accessLevel === 'ED' && context\.role !== 'tecnico'/);
  for (const route of [evidenceRoute, runtimeRoute, wasteRoute, offlineRoute, planRoute, closeQueueRoute]) {
    assert.match(route, /canBypassAssignedMaintenanceExecution/);
  }
  assert.match(executionRoute, /context\.role === 'tecnico'/);
  assert.match(executionRoute, /requireAssignedMaintenanceExecution/);
});
