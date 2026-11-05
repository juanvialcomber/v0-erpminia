import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const authority = await readFile(new URL('../lib/maintenance/work-order-authority.ts', import.meta.url), 'utf8');
const detailRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url), 'utf8');
const viewer = await readFile(new URL('../app/api/maintenance/viewer-context/route.ts', import.meta.url), 'utf8');
const timer = await readFile(new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url), 'utf8');
const evidence = await readFile(new URL('../app/api/maintenance/work-orders/[id]/evidence/route.ts', import.meta.url), 'utf8');
const fluids = await readFile(new URL('../app/api/maintenance/work-orders/[id]/fluids/route.ts', import.meta.url), 'utf8');
const fluidClosure = await readFile(new URL('../app/api/maintenance/work-orders/[id]/fluids/closure/route.ts', import.meta.url), 'utf8');
const plan = await readFile(new URL('../app/api/maintenance/work-orders/[id]/standard-plan/route.ts', import.meta.url), 'utf8');
const waste = await readFile(new URL('../app/api/maintenance/work-orders/[id]/waste/route.ts', import.meta.url), 'utf8');
const offline = await readFile(new URL('../app/api/maintenance/work-orders/[id]/offline-notes/route.ts', import.meta.url), 'utf8');
const execution = await readFile(new URL('../app/api/maintenance/work-orders/[id]/execution/route.ts', import.meta.url), 'utf8');
const materials = await readFile(new URL('../app/api/maintenance/work-orders/[id]/materials/route.ts', import.meta.url), 'utf8');
const issueMaterials = await readFile(new URL('../app/api/maintenance/work-orders/[id]/issue-materials/route.ts', import.meta.url), 'utf8');
const parts = await readFile(new URL('../app/api/maintenance/work-orders/[id]/reserve-parts/route.ts', import.meta.url), 'utf8');
const detailUi = await readFile(new URL('../components/maintenance/work-order-detail.tsx', import.meta.url), 'utf8');
const materialUi = await readFile(new URL('../components/maintenance/work-order-material-coverage.tsx', import.meta.url), 'utf8');
const partsUi = await readFile(new URL('../components/maintenance/work-order-parts-panel.tsx', import.meta.url), 'utf8');
const legacyMatrix = await readFile(new URL('../supabase/migrations/20260911024500_align_maintenance_execution_role_permissions.sql', import.meta.url), 'utf8');

test('module ED is not treated as global OT planning authority', () => {
  assert.match(authority, /const canPlan = creation\.canCreate \|\| isAdminRole\(context\.role\)/);
  assert.match(authority, /canReadAllWorkOrders = canPlan \|\| canApprove \|\| creation\.accessLevel === 'LEC'/);
  assert.doesNotMatch(authority, /accessLevel === 'ED'.*canPlan/);
  assert.match(legacyMatrix, /Execution roles can operate assigned work orders/);
});

test('OT detail separates planning execution close cancel and approval permissions', () => {
  for (const permission of ['canPlan','canEditOrder','canAssign','canCancel','canStart','canRecordExecution','canClose','canApprove']) {
    assert.match(authority, new RegExp(permission));
  }
  assert.match(detailRoute, /getWorkOrderPermissions\(authority, data\)/);
  assert.match(detailRoute, /const hasPlanningAuthority = authority\.canPlan/);
  assert.match(viewer, /permissions: \{/);
});

test('execution evidence mutations require the assigned executor', () => {
  assert.match(timer, /const executionAccess = await requireAssignedMaintenanceExecution\(context, workOrderId\);\s*if \(!executionAccess\.ok\) return executionAccess\.response/);
  assert.match(evidence, /authorizeWrite/);
  assert.match(evidence, /requireAssignedMaintenanceExecution\(context, workOrderId\)/);
  assert.match(fluids, /if \(!execution\.ok\) return execution\.response/);
  assert.match(fluidClosure, /if \(!assigned\.ok\) return assigned\.response/);
  assert.match(plan, /const executionAccess = await requireAssignedMaintenanceExecution\(context, id\);\s*if \(!executionAccess\.ok\) return executionAccess\.response/);
  assert.match(waste, /const execution = await requireAssignedMaintenanceExecution\(context, workOrderId\);\s*return execution\.ok/);
  assert.match(offline, /if \(!assigned\.ok\) return assigned\.response/);
});

test('OT backoffice mutations require planning authority', () => {
  assert.match(execution, /if \(!authority\.canPlan\)/);
  assert.match(materials, /if \(!authority\.canPlan\)/);
  assert.match(issueMaterials, /if \(!authority\.canPlan\)/);
  assert.match(parts, /if \(!authority\.canPlan\)/);
});

test('OT UI exposes only actions allowed for the current person', () => {
  assert.match(detailUi, /const permissions = data\?\.permissions \|\| \{\}/);
  assert.match(detailUi, /canEdit=\{canRecordExecution\}/);
  assert.match(detailUi, /canCancel \?/);
  assert.match(detailUi, /canStart \?/);
  assert.match(detailUi, /canClose \?/);
  assert.match(detailUi, /Lista para ejecutar · el responsable asignado inicia el trabajo/);
  assert.doesNotMatch(detailUi, /const canEdit = Boolean\(data\?\.canEdit\)/);
});

test('material and parts surfaces hide mutations when permission is absent', () => {
  assert.match(materialUi, /const canDefine = Boolean\(permissions\.canDefine\)/);
  assert.match(materialUi, /Pendiente de jefatura/);
  assert.match(partsUi, /const canEdit = Boolean\(data\?\.canEdit\)/);
  assert.match(partsUi, /\{canEdit \? <section/);
  assert.match(partsUi, /pending > 0 && canEdit/);
});
