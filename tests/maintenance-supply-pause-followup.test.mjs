import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const timerUi = await readFile(new URL('../components/maintenance/work-order-timer.tsx', import.meta.url), 'utf8');
const timerApi = await readFile(new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url), 'utf8');
const controlCenter = await readFile(new URL('../app/api/maintenance/control-center/route.ts', import.meta.url), 'utf8');

test('supply pause requires operator detail instead of a generic reason', () => {
  assert.match(timerUi, /Falta de repuesto o material/);
  assert.match(timerUi, /Indica qué repuesto o material falta/);
  assert.match(timerApi, /supplyPause/);
  assert.match(timerApi, /supplyDetail/);
  assert.match(timerApi, /Indica qué repuesto o material falta antes de pausar/);
});

test('supply pause records a non-canonical followup without inventing product identity', () => {
  assert.match(timerApi, /supply_blocker_reported/);
  assert.match(timerApi, /requires_supply_followup: true/);
  assert.match(timerApi, /canonical_product_id: null/);
  assert.match(timerApi, /work_order_material_requirements/);
  assert.doesNotMatch(timerApi, /canonical_product_id:\s*['"]/);
});

test('control center surfaces unresolved supply blockers until material requirement exists', () => {
  assert.match(controlCenter, /supply_followup/);
  assert.match(controlCenter, /Formalizar repuesto\/material faltante/);
  assert.match(controlCenter, /work_order_material_requirements/);
  assert.match(controlCenter, /ordersWithMaterialRequirement/);
  assert.match(controlCenter, /pendingSupplyFollowups/);
  assert.match(controlCenter, /Bodega, Compras o responsable identifica producto y cantidad/);
});
