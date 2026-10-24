import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/maintenance/material-traceability-readiness/route.ts','utf8');
const component=fs.readFileSync('components/maintenance/material-traceability-readiness.tsx','utf8');
const executive=fs.readFileSync('components/maintenance/maintenance-executive-dashboard.tsx','utf8');

test('traceability readiness includes a 30-day evidence trend',()=>{
  assert.match(route,/motil_material_traceability_history/);
  assert.match(route,/p_days: 30/);
  assert.match(component,/Baseline capturado/);
  assert.match(component,/Evolución 30 días/);
  assert.match(component,/no equivale a ahorro/);
});

test('Ariel executive view surfaces traceability without turning it into a maintenance KPI',()=>{
  assert.match(executive,/material-traceability-readiness/);
  assert.match(executive,/Trazabilidad material/);
  assert.match(executive,/OT completadas aún tienen una brecha de trazabilidad material/);
  assert.match(executive,/data-readiness/);
});