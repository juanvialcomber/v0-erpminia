import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../app/api/maintenance/preventive-history/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/dashboard/mantenimiento/preventivo-horas/page.tsx', import.meta.url), 'utf8');

test('historical preventive archive is review-only until a planner restores one schedule', () => {
  assert.match(api, /archiveIsHistorical: true/);
  assert.match(api, /noAutoRestore: true/);
  assert.match(page, /Pautas históricas para validar/);
  assert.match(page, /Validar y activar/);
});

test('restored schedules preserve provenance and never promote stale current meter', () => {
  assert.match(api, /source_reference: sourceReference/);
  assert.match(api, /source_hash: record\.source_hash/);
  assert.match(api, /current_meter_snapshot: null/);
  assert.match(api, /currentMeterCopied: false/);
  assert.match(page, /La lectura vigente se toma desde MOTIL/);
});

test('restore is tenant scoped and requires a live canonical asset', () => {
  assert.match(api, /record\.organization_id !== context\.organizationId/);
  assert.match(api, /maintenance_canonical_assets_v1/);
  assert.match(api, /El equipo histórico ya no existe en el maestro canónico/);
});

test('restore rejects duplicates and invalid frequencies', () => {
  assert.match(api, /Esta pauta ya está activa/);
  assert.match(api, /no tiene una frecuencia válida/);
  assert.match(api, /preventive_maintenance_schedules/);
});

test('next due meter is derived only from explicit historical execution base plus frequency', () => {
  assert.match(api, /lastExecutedMeter \+ frequencyHours/);
  assert.match(api, /next_due_meter: derivedNextDueMeter/);
  assert.doesNotMatch(api, /current_meter_snapshot:\s*record\.current_meter_snapshot/);
});
