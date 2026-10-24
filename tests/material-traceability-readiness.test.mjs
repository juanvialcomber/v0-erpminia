import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024003000_material_traceability_readiness.sql','utf8');
const route=fs.readFileSync('app/api/maintenance/material-traceability-readiness/route.ts','utf8');
const component=fs.readFileSync('components/maintenance/material-traceability-readiness.tsx','utf8');
const page=fs.readFileSync('app/dashboard/mantenimiento/data-readiness/page.tsx','utf8');

test('material readiness measures sequential evidence without treating Laudus purchase as asset consumption',()=>{
  assert.match(migration,/material_intent_missing/);
  assert.match(migration,/requirements_without_part_trace/);
  assert.match(migration,/issued_not_installed/);
  assert.match(migration,/economic_trace_ready/);
  assert.match(migration,/no_auto_asset_consumption_from_laudus/);
  assert.match(migration,/no mide calidad del mantenimiento ni ROI/);
  assert.match(route,/motil_material_traceability_readiness/);
});

test('data readiness exposes prioritized OT traceability actions',()=>{
  assert.match(component,/Trazabilidad económica de OT/);
  assert.match(component,/OT → material → Bodega → instalación → Activo 360 → Laudus/);
  assert.match(component,/Cola de trazabilidad/);
  assert.match(component,/Productos requeridos \/ con Laudus/);
  assert.match(page,/MaintenanceMaterialTraceabilityReadiness/);
});