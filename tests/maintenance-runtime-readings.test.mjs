import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827224000_asset_runtime_readings_v1.sql', 'utf8');
const api = fs.readFileSync('app/api/maintenance/runtime-readings/route.ts', 'utf8');
const page = fs.readFileSync('app/dashboard/mantenimiento/horometros/page.tsx', 'utf8');

test('runtime readings preserve source evidence and detect meter resets', () => {
  assert.match(migration, /source_type text not null/);
  assert.match(migration, /source_reference text/);
  assert.match(migration, /meter_hours < previous_meter_hours/);
  assert.match(migration, /operating_hours_delta/);
  assert.match(migration, /reset_detected/);
});

test('runtime views stay backend only and security invoker', () => {
  assert.match(migration, /security_invoker=true/i);
  assert.match(migration, /revoke all .* from public, anon, authenticated/i);
  assert.match(migration, /grant select .* to service_role/i);
});

test('runtime API is tenant scoped and records authenticated actor', () => {
  assert.match(api, /eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /recorded_by: context\.userId/);
  assert.match(api, /MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
});

test('runtime workspace refuses false rate metrics without enough evidence', () => {
  assert.match(page, /Sin base suficiente/);
  assert.match(page, /Aún no existen lecturas reales de horómetro/);
  assert.match(page, /resetDetected/);
  assert.match(page, /no se usará para tasas/);
});
