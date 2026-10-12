import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../components/maintenance/asset-360/attention-card.tsx', import.meta.url), 'utf8');
test('asset 360 work orders only route into closure when evidence says ready', () => {
  assert.match(source, /actionableWorkOrder\.ready_to_close\s*\?/);
  assert.match(source, /ordenes-trabajo\/cierre\?workOrderId=/);
  assert.match(source, /ordenes-trabajo\/\$\{encodeURIComponent\(actionableWorkOrder\.work_order_id\)\}/);
  assert.match(source, /'Revisar cierre' : 'Continuar trabajo'/);
});

test('asset 360 offers an actionable planning route when no OT is available', () => {
  assert.match(source, /!actionableWorkOrder && maintenancePriority/);
  assert.match(source, /href="\/dashboard\/mantenimiento\/planificacion"/);
  assert.match(source, /Ver planificación/);
});
