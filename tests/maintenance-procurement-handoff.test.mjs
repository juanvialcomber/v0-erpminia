import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const supplyApi = fs.readFileSync('app/api/procurement/supply-needs/route.ts','utf8');
const handoff = fs.readFileSync('components/procurement/maintenance-supply-handoffs.tsx','utf8');
const compras = fs.readFileSync('app/dashboard/compras/page.tsx','utf8');

test('maintenance shortage handoff stays inside procurement authority', () => {
  assert.match(supplyApi, /MODULE_KEYS\.FIN_COMPRAS/);
  assert.match(supplyApi, /convert_supply_need_to_intake_request/);
  assert.match(supplyApi, /requireModuleAccess\(request, MODULE_KEYS\.FIN_COMPRAS, true\)/);
  assert.match(handoff, /Tomar necesidad/);
  assert.match(handoff, /No adjudica proveedor, no emite OC y no compra automáticamente/);
});

test('compras attention queue surfaces unconverted maintenance shortages first', () => {
  assert.match(compras, /MaintenanceSupplyHandoffs/);
  assert.match(compras, /<MaintenanceSupplyHandoffs \/>/);
  assert.match(handoff, /procurement_request_id/);
  assert.match(handoff, /filter\(\(need\) => !need\.procurement_request_id\)/);
  assert.match(handoff, /Faltantes reales detectados en una OT/);
});

test('handoff preserves traceability back to the source work order', () => {
  assert.match(handoff, /dashboard\/mantenimiento\/ordenes-trabajo/);
  assert.match(handoff, /work_order_number/);
  assert.match(handoff, /asset_code/);
  assert.match(handoff, /shortage_lines/);
});
