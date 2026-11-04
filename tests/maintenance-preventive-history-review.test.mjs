import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../app/api/maintenance/preventive-history/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/dashboard/mantenimiento/preventivo-horas/page.tsx', import.meta.url), 'utf8');

test('historical preventive archive is review-only until a planner restores one schedule', () => {
  assert.match(api, /archiveIsHistorical: true/);
  assert.match(api, /noAutoRestore: true/);
  assert.match(page, /Pautas históricas para validar/);
  assert.match(page, /Validar seleccionadas|Guardar y validar|>Validar</);
});

test('restored schedules preserve provenance and never promote stale current meter', () => {
  assert.match(api, /source_reference: sourceReference/);
  assert.match(api, /source_hash: record\.source_hash/);
  assert.match(api, /current_meter_snapshot: null/);
  assert.match(api, /currentMeterCopied: false/);
  assert.match(page, /el horómetro vigente siempre se obtiene desde MOTIL/i);
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


test('preventive review workbench groups by asset and exposes compact decision states', () => {
  assert.match(page, /Pautas históricas para validar/);
  assert.match(page, /Por revisar/);
  assert.match(page, /Validadas/);
  assert.match(page, /Descartadas/);
  assert.match(page, /Buscar equipo o tarea/);
  assert.match(page, /Horómetro vigente/);
});

test('planner can edit before validation and dismiss without mutating historical source', () => {
  assert.match(page, /Editar antes de validar/);
  assert.match(page, /Guardar y validar/);
  assert.match(page, /Descartar/);
  assert.match(api, /action === 'dismiss'/);
  assert.match(api, /archiveMutated: false/);
  assert.match(api, /Validada con ajuste por planificación/);
});

test('bulk validation remains an explicit human selection action', () => {
  assert.match(page, /Validar seleccionadas/);
  assert.match(page, /type="checkbox"/);
  assert.match(api, /noAutoRestore: true/);
  assert.doesNotMatch(api, /auto.*validate|validate.*auto/i);
});

test('review decisions are auditable and current runtime context is separate from historical base', () => {
  assert.match(api, /maintenance_preventive_history_reviews/);
  assert.match(api, /asset_runtime_readings/);
  assert.match(api, /currentMeterNotCopied: true/);
  assert.match(page, /El archivo histórico permanece intacto/);
});
