import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/maintenance/control-center/route.ts', 'utf8');

test('completed work orders with open supply remain visible as operational blockers', () => {
  assert.match(route, /work_order_supply_chain_v1/);
  assert.match(route, /eq\('work_order_status', 'completed'\)/);
  assert.match(route, /completedSupplyRows/);
  assert.match(route, /supply-integrity:/);
  assert.match(route, /kind: 'operational_blocker'/);
  assert.match(route, /Conciliar abastecimiento post-cierre/);
});

test('post-close supply integrity is read-only and does not reopen or mutate work orders', () => {
  assert.doesNotMatch(route, /\.update\([^\n]*maintenance_work_orders/);
  assert.doesNotMatch(route, /\.delete\([^\n]*maintenance_work_orders/);
  assert.match(route, /completedWithOpenSupply/);
});