import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(
  new URL('../supabase/migrations/20260829201210_add_production_manual_flow_fidelity_v2.sql', import.meta.url),
  'utf8'
);
const route = await readFile(
  new URL('../app/api/produccion/planta-metalurgia/route.ts', import.meta.url),
  'utf8'
);
const dashboard = await readFile(
  new URL('../components/production/plant-metallurgy-dashboard.tsx', import.meta.url),
  'utf8'
);

test('flow v2 preserves historical provenance while admitting exact manual evidence', () => {
  assert.match(migration, /TM 2026 actualizado \(06-08-2026\)\.xlsx/);
  assert.match(migration, /LEY \(1\)\.xlsx/);
  assert.match(migration, /\^manual:\/\/production\/mineral_transport\//);
  assert.match(migration, /\^manual:\/\/production\/plant_metallurgy\//);
  assert.match(migration, /manual_dates[\s\S]*evidence_days[\s\S]*union/);
});

test('manual evidence never converts uncovered dates into zero transport', () => {
  assert.match(migration, /when j\.manual_movement_rows > 0 then 'manual_evidence'/);
  assert.match(migration, /'historical_and_manual_evidence'/);
  assert.match(migration, /else 'outside_source_window'/);
  assert.match(migration, /else null::numeric/);
  assert.match(migration, /when c\.transported_t is null then 'movement_source_not_available'/);
});

test('plant API reconciles historical coverage plus exact manual movement dates', () => {
  assert.match(route, /production_flow_daily_fidelity_v2/);
  assert.match(route, /COMPARABLE_MOVEMENT_STATES/);
  assert.match(route, /'manual_evidence'/);
  assert.match(route, /'historical_and_manual_evidence'/);
  assert.match(route, /manualMovementDays/);
  assert.match(route, /Los ingresos manuales posteriores se comparan sólo en su fecha exacta/);
});

test('plant UI labels manual evidence without claiming broader TM coverage', () => {
  assert.match(dashboard, /Los ingresos manuales no cambian esa fecha/);
  assert.match(dashboard, /Los ingresos manuales sólo completan los días registrados/);
  assert.match(dashboard, /Si falta información, mostramos “sin dato”, no cero/);
  assert.match(dashboard, /r\.movementSourceState\.includes\('manual'\)/);
});

test('flow v2 remains a service-role-only security-invoker surface', () => {
  assert.match(migration, /with \(security_invoker = true\)/);
  assert.match(migration, /revoke all on public\.production_flow_daily_fidelity_v2 from public/);
  assert.match(migration, /from anon/);
  assert.match(migration, /from authenticated/);
  assert.match(migration, /grant select on public\.production_flow_daily_fidelity_v2 to service_role/);
});
