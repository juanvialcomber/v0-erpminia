import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261104143000_link_fluid_usage_to_waste.sql','utf8');
const fluidsApi = fs.readFileSync('app/api/maintenance/work-orders/[id]/fluids/route.ts','utf8');
const fluidsUi = fs.readFileSync('components/maintenance/work-order-fluid-usage-panel.tsx','utf8');
const wasteUi = fs.readFileSync('components/maintenance/maintenance-waste-register.tsx','utf8');

test('fluid usage can create one explicitly reported linked waste record', () => {
  assert.match(migration,/source_fluid_usage_id/);
  assert.match(migration,/unique index/i);
  assert.match(fluidsApi,/recovered_waste_liters/);
  assert.match(fluidsApi,/source_fluid_usage_id: data\.id/);
  assert.match(fluidsApi,/classification: 'to_classify'/);
  assert.match(fluidsApi,/linkedWasteCreated/);
});

test('waste quantity is never inferred from fluid input quantity', () => {
  assert.match(fluidsUi,/No se infiere desde los litros cargados/);
  assert.match(fluidsApi,/recoveredWasteLiters/);
  assert.doesNotMatch(fluidsApi,/recoveredWasteLiters\s*=\s*quantityLiters/);
  assert.doesNotMatch(fluidsApi,/quantity:\s*quantityLiters/);
});

test('linked waste remains visible in both lubrication and waste surfaces', () => {
  assert.match(fluidsUi,/Residuo vinculado/);
  assert.match(wasteUi,/Desde lubricación/);
  assert.match(wasteUi,/source_fluid_usage_id/);
});
