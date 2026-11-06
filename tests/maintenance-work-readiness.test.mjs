import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const detail = fs.readFileSync('components/maintenance/work-order-detail.tsx', 'utf8');
const readiness = fs.readFileSync('components/maintenance/work-order-execution-readiness.tsx', 'utf8');
const releaseReadiness = fs.readFileSync('lib/maintenance/work-order-release-readiness.ts', 'utf8');

test('work order detail surfaces execution readiness before execution panels', () => {
  assert.match(detail, /WorkOrderExecutionReadiness/);
  assert.match(detail, /assignedToName=\{workOrder\.assigned_to_name\}/);
  assert.match(detail, /status=\{workOrder\.status\}/);
});

test('execution readiness uses existing material coverage and explicit assignee evidence', () => {
  assert.match(readiness, /\/api\/maintenance\/work-orders\/\$\{workOrderId\}\/materials/);
  assert.match(readiness, /Boolean\(assignedToName\?\.trim\(\)\)/);
  assert.match(readiness, /shortageRows/);
  assert.match(readiness, /Falta asignar responsable antes de ejecutar el trabajo/);
});

test('execution readiness does not infer material readiness when requirements are absent', () => {
  assert.match(readiness, /Sin requerimientos de material registrados\. No se infiere que existan ni que estén cubiertos\./);
  assert.match(readiness, /No reemplaza la decisión del supervisor ni bloquea el inicio de la OT\./);
  assert.doesNotMatch(readiness, /method:\s*['\"]PATCH['\"]/);
  assert.doesNotMatch(readiness, /status:\s*['\"]in_progress['\"]/);
});

test('general workshop work does not require a canonical asset to start', () => {
  assert.match(releaseReadiness, /const isGeneralWork = workType === 'general'/);
  assert.match(releaseReadiness, /asset: isGeneralWork \|\| Boolean\(typedOrder\.canonical_asset_id\)/);
  assert.match(releaseReadiness, /if \(!checks\.asset\) blockers\.push/);
});
