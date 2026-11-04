import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const fluidsApi = fs.readFileSync('app/api/maintenance/work-orders/[id]/fluids/route.ts','utf8');
const wasteApi = fs.readFileSync('app/api/maintenance/waste/route.ts','utf8');
const fluidsUi = fs.readFileSync('components/maintenance/work-order-fluid-usage-panel.tsx','utf8');
const wasteUi = fs.readFileSync('components/maintenance/maintenance-waste-register.tsx','utf8');

test('fluid usage can create one explicitly reported linked waste record using event evidence', () => {
  assert.match(fluidsApi,/recovered_waste_liters/);
  assert.match(fluidsApi,/source_fluid_usage_id: data\.id/);
  assert.match(fluidsApi,/event_type: 'waste_generated'/);
  assert.match(fluidsApi,/linkedWasteCreated/);
  assert.match(fluidsApi,/wasteByUsage/);
});

test('waste quantity is never inferred from fluid input quantity', () => {
  assert.match(fluidsUi,/No se infiere desde los litros cargados/);
  assert.match(fluidsApi,/recoveredWasteLiters/);
  assert.doesNotMatch(fluidsApi,/recoveredWasteLiters\s*=\s*quantityLiters/);
  assert.doesNotMatch(fluidsApi,/quantity:\s*quantityLiters/);
});

test('linked waste remains visible in both lubrication and waste surfaces without schema migration', () => {
  assert.match(fluidsUi,/Residuo vinculado/);
  assert.match(wasteApi,/from_lubrication/);
  assert.match(wasteApi,/source_fluid_usage_id/);
  assert.match(wasteUi,/Desde lubricación/);
  assert.doesNotMatch(wasteApi,/source_fluid_usage_id\s*,/);
});
