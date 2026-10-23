import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const queue=fs.readFileSync('app/api/maintenance/work-order-close-queue/route.ts','utf8');
const component=fs.readFileSync('components/maintenance/progressive-work-order-close-queue.tsx','utf8');
const close=fs.readFileSync('app/api/maintenance/work-orders/[id]/close/route.ts','utf8');
const dict=fs.readFileSync('lib/i18n/dictionaries.ts','utf8');

test('progressive close makes material intent an explicit next action',()=>{
  assert.match(queue,/declare_materials/);
  assert.match(queue,/define_materials/);
  assert.match(queue,/materials_required/);
  assert.match(component,/Sí, usa materiales/);
  assert.match(component,/No usa materiales/);
  assert.match(component,/method: 'PATCH'/);
  assert.match(dict,/declareMaterials: 'Confirmar uso de materiales'/);
  assert.match(dict,/defineMaterials: 'Definir materiales de la OT'/);
});

test('close endpoint refuses ambiguous or inconsistent material state before stopping timer',()=>{
  assert.match(close,/Confirma si la OT utilizó materiales antes de cerrar/);
  assert.match(close,/marcada con uso de materiales, pero no tiene materiales requeridos/);
  assert.match(close,/marcada sin materiales, pero existen requerimientos activos/);
  const materialGate=close.indexOf('Confirma si la OT utilizó materiales antes de cerrar');
  const timerTermination=close.indexOf("p_action: 'terminate'");
  assert.ok(materialGate > -1 && timerTermination > materialGate);
});