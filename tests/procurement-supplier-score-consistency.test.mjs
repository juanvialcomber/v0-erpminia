import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/procurement/supplier-control/route.ts','utf8');
const control = fs.readFileSync('app/dashboard/compras/control-proveedores/page.tsx','utf8');
const detail = fs.readFileSync('app/dashboard/compras/proveedores-360/page.tsx','utf8');

test('supplier control and supplier 360 use the same v2 score source', () => {
  assert.match(route, /supplier_operational_score_v2/);
  assert.doesNotMatch(route, /supplier_performance_v1/);
  assert.match(detail, /Score operacional v2/);
});

test('supplier control shows evidence coverage instead of hiding sample size', () => {
  assert.match(control, /Cobertura entrega/);
  assert.match(control, /delivery_scored_orders/);
  assert.match(control, /completed_orders/);
  assert.match(control, /operational_score/);
  assert.match(control, /Sin evidencia/);
});

test('supplier control no longer renders the legacy performance score contract', () => {
  assert.doesNotMatch(control, /performance_score/);
  assert.doesNotMatch(control, /on_time_rate/);
});