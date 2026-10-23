import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const context=fs.readFileSync('lib/api/organization-context.ts','utf8');
const route=fs.readFileSync('app/api/maintenance/work-orders/[id]/materials/route.ts','utf8');
const coverage=fs.readFileSync('components/maintenance/work-order-material-coverage.tsx','utf8');
const detail=fs.readFileSync('components/maintenance/work-order-detail.tsx','utf8');

test('assigned executor can declare or add OT materials without gaining warehouse issue authority',()=>{
  assert.match(context,/\['POST', 'PATCH'\].*materials/);
  assert.match(route,/requireAssignedMaintenanceExecution/);
  assert.match(route,/accessLevel === 'ED'/);
  assert.doesNotMatch(context,/issue-materials.*return true/);
  assert.match(detail,/WorkOrderMaterialCoverage workOrderId=\{id\} executionMode/);
});

test('execution mode records demand but leaves stock delivery and procurement actions to authorized roles',()=>{
  assert.match(coverage,/Material reservado en Bodega/);
  assert.match(coverage,/Bodega o supervisión debe registrar la entrega/);
  assert.match(coverage,/Faltante detectado/);
  assert.match(coverage,/Compras debe gestionar/);
});