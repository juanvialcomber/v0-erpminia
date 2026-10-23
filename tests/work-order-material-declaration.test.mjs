import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024002000_work_order_material_declaration.sql','utf8');
const route=fs.readFileSync('app/api/maintenance/work-orders/[id]/materials/route.ts','utf8');
const coverage=fs.readFileSync('components/maintenance/work-order-material-coverage.tsx','utf8');
const detail=fs.readFileSync('components/maintenance/work-order-detail.tsx','utf8');
const review=fs.readFileSync('app/api/maintenance/work-orders/[id]/review/route.ts','utf8');

test('modern OT distinguishes no materials from missing material declaration',()=>{
  assert.match(migration,/materials_required boolean/);
  assert.match(migration,/declare_work_order_materials_v1/);
  assert.match(migration,/revoke execute .* public,anon,authenticated/);
  assert.match(route,/export async function PATCH/);
  assert.match(route,/materialDeclaration/);
  assert.match(coverage,/¿Esta OT utilizará repuestos o materiales?/);
  assert.match(coverage,/No requiere materiales/);
  assert.match(detail,/WorkOrderMaterialCoverage workOrderId=\{id\}/);
});

test('supervisor approval requires material intent consistency',()=>{
  assert.match(review,/Confirma si la OT utilizó materiales antes de aprobar/);
  assert.match(review,/marcada con uso de materiales, pero no tiene materiales requeridos/);
  assert.match(review,/marcada sin materiales, pero existen requerimientos activos/);
});