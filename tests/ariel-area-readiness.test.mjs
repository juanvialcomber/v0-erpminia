import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const route=readFileSync(new URL('../app/api/maintenance/area-readiness/route.ts',import.meta.url),'utf8');
const page=readFileSync(new URL('../app/dashboard/mantenimiento/areas/page.tsx',import.meta.url),'utf8');
const planning=readFileSync(new URL('../components/maintenance/weekly-maintenance-planning.tsx',import.meta.url),'utf8');

test('Ariel area readiness uses real cross-area evidence without subjective scores',()=>{
  assert.match(route,/planning_weekly_work_sources/);
  assert.match(route,/production_source_documents/);
  assert.match(route,/bodega_stock_source_authority_service_v1/);
  assert.match(route,/procurement_match_exceptions/);
  assert.match(route,/motil_finance_asset_stage/);
  assert.match(route,/production_drill_holes/);
  assert.doesNotMatch(route,/score/i);
});

test('area workspace exposes evidence gap and next action with human authority',()=>{
  assert.match(page,/Estado de áreas/);
  assert.match(page,/Siguiente acción/);
  assert.match(page,/Cada jefe valida su propia información/);
  assert.match(planning,/\/dashboard\/mantenimiento\/areas/);
});

test('Ariel area readiness phase 2 includes people HSE and legal evidence',()=>{
  assert.match(route,/from\('people'\)/);
  assert.match(route,/sostenibilidad_nonconformances/);
  assert.match(route,/legal_cases/);
  assert.match(route,/name:'RRHH'/);
  assert.match(route,/name:'Sostenibilidad \/ HSE'/);
  assert.match(route,/name:'Legal'/);
  assert.match(route,/evidencia candidata no acredita aplicabilidad ni cumplimiento/i);
});
