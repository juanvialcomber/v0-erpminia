import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024003500_material_traceability_readiness.sql','utf8');
const route=fs.readFileSync('app/api/maintenance/material-traceability-readiness/route.ts','utf8');
const component=fs.readFileSync('components/maintenance/material-traceability-readiness.tsx','utf8');
const page=fs.readFileSync('app/dashboard/mantenimiento/data-readiness/page.tsx','utf8');

test('material traceability measures the evidence chain without inventing economics',()=>{
  assert.match(migration,/material_intent_missing/);
  assert.match(migration,/requirements_without_part_trace/);
  assert.match(migration,/reserved_not_issued/);
  assert.match(migration,/issued_not_installed/);
  assert.match(migration,/economic_trace_ready/);
  assert.match(migration,/score.*no mide calidad del mantenimiento ni ROI/);
  assert.match(route,/MODULE_KEYS\.MANT_GERENCIAL/);
  assert.match(component,/Cobertura económica de las OT/);
  assert.match(component,/Historial Laudus del SKU no equivale a consumo por el activo/);
  assert.match(page,/MaterialTraceabilityReadiness/);
});

test('traceability queue exposes one next action per gap',()=>{
  assert.match(component,/Confirmar uso de materiales/);
  assert.match(component,/Definir materiales/);
  assert.match(component,/Registrar entrega/);
  assert.match(component,/Confirmar instalación o devolución/);
  assert.match(component,/Resolver vínculo Laudus/);
});