import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const execution = await readFile(new URL('../app/api/maintenance/work-orders/[id]/execution/route.ts', import.meta.url), 'utf8');
const eam = await readFile(new URL('../app/api/maintenance/eam-readiness/route.ts', import.meta.url), 'utf8');

test('execution API authorizes assigned executor independently from generic module write access', () => {
  assert.doesNotMatch(execution, /requireModuleAccess/);
  assert.match(execution, /getOrganizationContext\(request\)/);
  assert.match(execution, /getModuleAccessLevel/);
  assert.match(execution, /requireAssignedMaintenanceExecution/);
  assert.match(execution, /canReadModule = context\.role !== 'tecnico'/);
  assert.match(execution, /canWriteModule = accessLevel === 'ED' && context\.role !== 'tecnico'/);
  assert.match(execution, /if \(!canReadModule && !assignedExecution\.ok\) return assignedExecution\.response/);
  assert.match(execution, /if \(!canWriteModule && !assignedExecution\.ok\) return assignedExecution\.response/);
});

test('EAM readiness fails closed for users without maintenance read access', () => {
  assert.match(eam, /getModuleAccessLevel/);
  assert.match(eam, /accessLevel === 'SR'/);
  assert.doesNotMatch(eam, /if \(!accessLevel\)/);
});
