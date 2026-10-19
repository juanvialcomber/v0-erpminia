import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile(new URL('../app/api/maintenance/control-tower/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/mantenimiento/torre-control/page.tsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261019162500_maintenance_live_master_v1.sql', import.meta.url), 'utf8');

test('control tower is read-only and tenant-scoped', () => {
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.doesNotMatch(api, /export async function POST/);
  assert.match(api, /eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /mode: 'read_only'/);
});

test('live maintenance master keeps canonical truth separate from email and whatsapp evidence', () => {
  assert.match(migration, /canonical_status/);
  assert.match(migration, /reported_equipment_status/);
  assert.match(migration, /whatsapp_description/);
  assert.match(migration, /latest_signal_source/);
  assert.match(migration, /without silently promoting observations to canonical state/);
});

test('control tower includes email and whatsapp freshness plus unresolved email evidence', () => {
  assert.match(api, /motil_email_equipment_meter_stage/);
  assert.match(api, /motil_email_source_manifest/);
  assert.match(api, /motil_whatsapp_messages/);
  assert.match(api, /pendingEmailMatches/);
  assert.match(page, /Evidencia por vincular/);
});

test('control tower refreshes and rotates automatically with no operational actions', () => {
  assert.match(page, /refreshInterval: 60_000/);
  assert.match(page, /15_000/);
  assert.match(page, /Solo lectura/);
  assert.doesNotMatch(page, /onClick=/);
  assert.doesNotMatch(page, /<Button/);
});
