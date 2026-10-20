import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/planificacion/reconciliacion/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/planificacion/datos/page.tsx', import.meta.url), 'utf8');
const dict = await readFile(new URL('../lib/i18n/dictionaries.ts', import.meta.url), 'utf8');

test('planner reconciliation is organization scoped and writable by authorized planner role', () => {
  assert.match(api, /requireModuleAccess/);
  assert.match(api, /MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
  assert.match(api, /\.eq\('organization_id', access\.organizationId\)/);
  assert.match(api, /manual_planner_review/);
  assert.match(api, /reconciliation_reviewed_by/);
  assert.match(api, /reconciliation_reviewed_at/);
});

test('planner reconciliation preserves canonical asset ownership and evidence lineage', () => {
  assert.match(api, /maintenance_canonical_assets_v1/);
  assert.match(api, /planning_maintenance_source_rows/);
  assert.match(api, /planning_asset_meter_readings/);
  assert.match(api, /workbook_initial/);
  assert.match(api, /workbook_current/);
  assert.doesNotMatch(api, /from\('maintenance_canonical_assets_v1'\)\s*\.update\(/);
});

test('workspace shows only unresolved decisions without redundant user labeling', () => {
  assert.match(page, /MOTIL ya resolvió lo demostrable con la data disponible/);
  assert.match(page, /Aclaraciones pendientes/);
  assert.match(page, /Pendientes/);
  assert.match(page, /ambigüedad real/);
  assert.match(page, /Identidad pendiente/);
  assert.match(page, /¿Este equipo ya existe en MOTIL\?/);
  assert.match(page, /Sí, es este/);
  assert.match(page, /Falta en MOTIL/);
  assert.match(page, /No sé todavía/);
  assert.match(page, /Buscar otro activo/);
  assert.doesNotMatch(page, /Pregunta para Ariel/);
  assert.doesNotMatch(page, /Necesitan a Ariel/);
  assert.match(dict, /assistantData: 'Datos de Ariel'/);
});

test('missing asset classifications stay separate from canonical asset mutation', () => {
  assert.match(api, /planner_declared_missing_asset/);
  assert.match(api, /system_verified_missing_asset/);
  assert.match(api, /MISSING_ASSET_METHODS/);
  assert.match(api, /reconciliation_status: 'unmatched'/);
  assert.match(api, /canonical_asset_id: null/);
  assert.doesNotMatch(api, /from\('maintenance_canonical_assets_v1'\)\s*\.(?:insert|upsert|update)\(/);
});
