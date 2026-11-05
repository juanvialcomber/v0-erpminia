import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const hours = await readFile(new URL('../app/api/maintenance/preventive-hours/route.ts', import.meta.url), 'utf8');
const preventive = await readFile(new URL('../app/api/maintenance/preventive/route.ts', import.meta.url), 'utf8');
const legacyGenerate = await readFile(new URL('../app/api/maintenance/preventive/[id]/generate/route.ts', import.meta.url), 'utf8');

test('preventive planning requires an authorized OT creator cargo, not ED matrix alone', () => {
  assert.match(hours, /getMaintenanceWorkOrderCreationCapability/);
  assert.match(hours, /!creationCapability\.canCreate/);
  assert.match(preventive, /getMaintenanceWorkOrderCreationCapability/);
  assert.ok((preventive.match(/!creationCapability\.canCreate/g) || []).length >= 2);
});

test('legacy preventive generation is write-gated, tenant-scoped and creator-cargo gated', () => {
  assert.match(legacyGenerate, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
  assert.match(legacyGenerate, /getMaintenanceWorkOrderCreationCapability/);
  assert.match(legacyGenerate, /!creationCapability\.canCreate/);
  assert.match(legacyGenerate, /preventive_maintenance_schedules/);
  assert.match(legacyGenerate, /eq\('organization_id', context\.organizationId\)/);
});
