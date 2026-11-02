import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync('app/api/maintenance/availability/summary/route.ts', 'utf8');
const ui = fs.readFileSync('components/maintenance/availability-semaphore.tsx', 'utf8');
const reportedApi = fs.readFileSync('app/api/maintenance/availability/reported/route.ts', 'utf8');
const byZoneApi = fs.readFileSync('app/api/maintenance/availability/by-zone/route.ts', 'utf8');
const importer = fs.readFileSync('scripts/import-don-jaime-reported-availability.mjs', 'utf8');
const reportedMigration = fs.readFileSync('supabase/migrations/20261102193000_don_jaime_reported_availability_v1.sql', 'utf8');
const page = fs.readFileSync('app/dashboard/mantenimiento/disponibilidad/page.tsx', 'utf8');
const dictionaries = fs.readFileSync('lib/i18n/dictionaries.ts', 'utf8');

test('availability uses canonical assets instead of cost centers as fleet truth', () => {
  assert.match(api, /canonical_assets_current/);
  assert.doesNotMatch(api, /from\('cost_centers'\)/);
  assert.match(api, /MODULE_KEYS\.MANT_OPERACIONES/);
});

test('availability refuses to publish an unsupported percentage', () => {
  assert.match(api, /availabilityPercentage:\s*null/);
  assert.match(api, /insufficient_operating_window/);
  assert.match(api, /ventana operativa comparable/i);
  assert.doesNotMatch(api, /availability\s*>=\s*80/);
});

test('availability UI distinguishes reported snapshot availability from timed availability', () => {
  assert.match(ui, /Disponibilidad reportada/);
  assert.match(ui, /V1 · snapshot diario/);
  assert.match(ui, /No reemplaza disponibilidad técnica horaria/i);
  assert.match(ui, /Cobertura de evidencia/);
  assert.match(ui, /Disponibilidad por máquina/);
  assert.match(ui, /Familias/);
  assert.match(ui, /Ficha 360/);
  assert.doesNotMatch(ui, /Disponibilidad en Tiempo Real/);
  assert.doesNotMatch(ui, /por debajo del 70/);
  assert.match(page, /getDictionaryForRequest\(\)/);
  assert.match(dictionaries, /cost centers no se interpretan como equipos/i);
});

test('reported availability uses classified daily observations as numerator and denominator', () => {
  assert.match(reportedApi, /reported_snapshot_v1/);
  assert.match(reportedApi, /availability_numerator/);
  assert.match(reportedApi, /availability_denominator/);
  assert.match(reportedApi, /classifiedObservations/);
  assert.match(reportedApi, /evidenceCoveragePercentage/);
  assert.match(reportedApi, /Observaciones diarias clasificables/);
  assert.match(reportedMigration, /availability_classification in \('available','unavailable'\)/);
  assert.match(reportedMigration, /availability_denominator/);
});

test('reported availability keeps STANDBY and unknown evidence out of the denominator', () => {
  assert.match(importer, /status === 'STANDBY'/);
  assert.match(importer, /classification: 'review_required'/);
  assert.match(reportedApi, /STANDBY se mantiene fuera del denominador/);
  assert.match(reportedMigration, /STANDBY remains review_required/);
});

test('daily snapshot V1 is separated from minute-based availability V2', () => {
  assert.match(reportedMigration, /intentionally separate from canonical\.asset_availability_daily/);
  assert.match(reportedMigration, /reported availability from daily equipment snapshots/i);
  assert.doesNotMatch(importer, /1440/);
  assert.doesNotMatch(reportedApi, /scheduled_minutes/);
  assert.doesNotMatch(reportedApi, /planned_downtime_minutes/);
  assert.match(reportedApi, /No utiliza minutos programados/);
});

test('report importer trusts internal report date and preserves provenance', () => {
  assert.match(importer, /FECHA DEL REPORTE/);
  assert.match(importer, /reportedDate/);
  assert.match(importer, /sourceSha/);
  assert.match(importer, /gmailMessageId/);
  assert.match(importer, /sourceRow/);
  assert.match(importer, /official_master_exact/);
  assert.match(importer, /official_master_unique_plate/);
});

test('legacy by-zone endpoint no longer labels operational share as availability', () => {
  assert.match(byZoneApi, /availabilityPercentage:\s*null/);
  assert.match(byZoneApi, /operationalSharePercentage/);
  assert.match(byZoneApi, /status_snapshot_not_availability/);
  assert.doesNotMatch(byZoneApi, /const availability = total > 0/);
});
