import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const timerUi = await readFile(new URL('../components/maintenance/work-order-timer.tsx', import.meta.url), 'utf8');
const timerApi = await readFile(new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url), 'utf8');
const controlCenter = await readFile(new URL('../app/api/maintenance/control-center/route.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261106003500_capture_supply_blocker_from_timer_pause_v1.sql', import.meta.url), 'utf8');

test('supply pause requires operator detail instead of a generic reason', () => {
  assert.match(timerUi, /Falta de repuesto o material/);
  assert.match(timerUi, /Indica qué repuesto o material falta/);
  assert.match(timerApi, /supplyPause/);
  assert.match(timerApi, /supplyDetail/);
  assert.match(timerApi, /Indica qué repuesto o material falta antes de pausar/);
});

test('supply pause followup is derived atomically from timer event without inventing product identity', () => {
  assert.match(migration, /capture_supply_blocker_from_timer_pause_v1/);
  assert.match(migration, /after insert on public\.work_order_events/i);
  assert.match(migration, /new\.event_type = 'timer_pause'/);
  assert.match(migration, /supply_blocker_reported/);
  assert.match(migration, /requires_supply_followup',true/);
  assert.match(migration, /'canonical_product_id',null/);
  assert.match(migration, /v_notes not like 'Falta de repuesto o material%'/);
});

test('control center surfaces unresolved supply blockers until material requirement exists', () => {
  assert.match(controlCenter, /supply_followup/);
  assert.match(controlCenter, /Formalizar repuesto\/material faltante/);
  assert.match(controlCenter, /work_order_material_requirements/);
  assert.match(controlCenter, /ordersWithMaterialRequirement/);
  assert.match(controlCenter, /pendingSupplyFollowups/);
  assert.match(controlCenter, /Bodega, Compras o responsable identifica producto y cantidad/);
});
