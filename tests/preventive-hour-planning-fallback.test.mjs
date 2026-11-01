import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20261019170000_preventive_hour_planning_fallback.sql', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/mantenimiento/preventivo-horas/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/maintenance/preventive-hours/route.ts', import.meta.url), 'utf8');

test('preventive hour evidence uses only planning rows measured in hours', () => {
  assert.match(migration, /from public\.planning_asset_meter_readings p/);
  assert.match(migration, /where p\.meter_unit='h'/);
  assert.match(migration, /p\.meter_value is not null/);
});

test('newest hour evidence wins while runtime keeps its canonical fields', () => {
  assert.match(migration, /lr\.recorded_at >= lp\.recorded_at/);
  assert.match(migration, /then lr\.meter_hours/);
  assert.match(migration, /when lp\.recorded_at is not null then lp\.meter_value/);
  assert.match(migration, /lr\.meter_hours as latest_runtime_meter/);
  assert.match(migration, /planning_reading/);
});

test('planning fallback preserves snapshot conflict detection and never bypasses missing due meter', () => {
  assert.match(migration, /me\.evidence_meter < p\.current_meter_snapshot/);
  assert.match(migration, /then 'needs_review'/);
  assert.match(migration, /then 'missing_due_meter'/);
  assert.match(migration, /then false/);
});

test('preventive UI and API expose planning history provenance explicitly', () => {
  assert.match(page, /Histórico planificación/);
  assert.match(page, /tasks_using_planning_reading/);
  assert.match(api, /tasks_using_planning_reading: 0/);
  assert.match(api, /histórico horario de planificación/);
});
