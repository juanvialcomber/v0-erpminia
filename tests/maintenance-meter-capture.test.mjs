import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const endpoint = new URL('../app/api/maintenance/runtime-readings/capture/route.ts', import.meta.url);
const page = new URL('../app/dashboard/mantenimiento/horometros/page.tsx', import.meta.url);

test('meter capture is scoped to authorized maintenance editors and tenant assets', async () => {
  const source = await readFile(endpoint, 'utf8');
  assert.match(source, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
  assert.match(source, /eq\('organization_id', context\.organizationId\)/);
  assert.match(source, /Number\.isFinite\(meterHours\)/);
});

test('photo capture is optional, bounded, and tied to recorded meter evidence', async () => {
  const source = await readFile(endpoint, 'utf8');
  assert.match(source, /form\.get\('photo'\)/);
  assert.match(source, /MAX_BYTES = 10 \* 1024 \* 1024/);
  assert.match(source, /source_reference: storedPath/);
  assert.match(source, /recorded_by: context\.userId/);
  assert.match(source, /\.remove\(\[storedPath\]\)/);
});

test('mechanic page captures camera or manual reading with a single save action', async () => {
  const source = await readFile(page, 'utf8');
  assert.match(source, /capture="environment"/);
  assert.match(source, /new FormData\(\)/);
  assert.match(source, /runtime-readings\/capture/);
  assert.match(source, /Guardar lectura/);
});

test('daily capture reevaluates enabled hour plans and leaves OT creation to a supervisor', async () => {
  const capture = await readFile(endpoint, 'utf8');
  const center = await readFile(new URL('../app/api/maintenance/control-center/route.ts', import.meta.url), 'utf8');
  assert.match(capture, /from\('preventive_maintenance_hour_status_v1'\)/);
  assert.match(capture, /eq\('enabled', true\)/);
  assert.match(capture, /plan\.alert_due && !plan\.meter_basis_conflict/);
  assert.match(center, /kind: 'preventive_overdue'/);
  assert.match(center, /!row\.generated_work_order_id/);
  assert.doesNotMatch(capture, /create_work_order_from_schedule/);
});

test('supervisors read a tenant-scoped audit with named equipment and temporary photo links', async () => {
  const history = await readFile(new URL('../app/api/maintenance/runtime-readings/history/route.ts', import.meta.url), 'utf8');
  assert.match(history, /requireModuleAccess\(request, MODULE_KEYS\.MANT_GERENCIAL\)/);
  assert.match(history, /from\('asset_runtime_readings'\)/);
  assert.match(history, /eq\('organization_id', context\.organizationId\)/);
  assert.match(history, /recorded_by_label/);
  assert.match(history, /asset_label/);
  assert.match(history, /createSignedUrl\(photoPath, 600\)/);
});

test('capture uses a unique database key to avoid simultaneous duplicate inserts', async () => {
  const capture = await readFile(endpoint, 'utf8');
  assert.match(capture, /id: submissionId/);
  assert.match(capture, /error\?\.code === '23505'/);
  assert.match(capture, /alreadySaved: true/);
  assert.match(capture, /storedPath = null; \/\/ Reading is durable/);
});
