import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('app/dashboard/mantenimiento/planificacion/page.tsx','utf8');
const workspace = fs.readFileSync('components/maintenance/weekly-maintenance-planning.tsx','utf8');
const api = fs.readFileSync('app/api/planning/maintenance/route.ts','utf8');

test('maintenance planning main entry is the weekly Ariel workspace', () => {
  assert.match(page, /WeeklyMaintenancePlanning/);
  assert.match(page, /Planificación semanal/);
  assert.doesNotMatch(page, /PreventivePlanBoard/);
});

test('weekly planning is decision-first and evidence grounded', () => {
  assert.match(workspace, /Qué debe decidir Ariel/);
  assert.match(workspace, /Bloqueadas por materiales/);
  assert.match(workspace, /Propuesto por MOTIL/);
  assert.match(workspace, /no reemplaza el juicio del supervisor/i);
  assert.match(api, /planning_maintenance_priority_v1/);
  assert.match(api, /maintenance_standard_job_plans/);
  assert.match(api, /parts_status_raw/);
  assert.match(api, /weeklyDecisions/);
});

test('weekly planning keeps one direct action per decision', () => {
  assert.match(workspace, /Abrir OT/);
  assert.match(workspace, /Revisar plan/);
  assert.match(workspace, /Programar/);
  assert.doesNotMatch(workspace, /Aprobar automáticamente|Generar automáticamente/i);
});
