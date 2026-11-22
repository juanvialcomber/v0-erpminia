import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827200500_expose_work_order_material_progress_v2.sql', 'utf8');
const component = fs.readFileSync('components/maintenance/work-order-material-coverage.tsx', 'utf8');

test('work order supply status separates reserved issued and procurement quantities', () => {
  assert.match(migration, /'reserved'/);
  assert.match(migration, /quantity_reserved/);
  assert.match(migration, /'issued'/);
  assert.match(migration, /quantity_issued/);
  assert.match(migration, /'in_procurement'/);
  assert.match(migration, /material_requirement_id = r\.id/);
  assert.match(migration, /source_supply_need_id = n\.id/);
});

test('material workspace renders the operational progression', () => {
  assert.match(component, /Requerido/);
  assert.match(component, /Reservado/);
  assert.match(component, /Entregado/);
  assert.match(component, /Faltante/);
  assert.match(component, /En Compras/);
  assert.match(component, /Estado y acciones opcionales/);
  assert.match(component, /gestión de Bodega es opcional/);
  assert.doesNotMatch(component, /Siguiente acción/);
});

test('material issue action depends on explicit reservations', () => {
  assert.match(component, /reservedLines > 0/);
  assert.match(component, /reserved = \(row: MaterialRow\) => Number\(row\.reserved \?\? 0\)/);
  assert.doesNotMatch(component, /reservedTotal > 0/);
  assert.match(component, /Entregar reservas/);
  assert.doesNotMatch(component, /availableCount > 0/);
});

test('procurement action is shown only before the shortage is handed off', () => {
  assert.match(component, /shortageCount > 0 && !alreadySent/);
  assert.match(component, /shortageCount > 0/);
  assert.doesNotMatch(component, /shortageTotal > 0 && !alreadySent/);
  assert.match(component, /Enviar a Compras/);
  assert.match(component, /Compras está gestionando los faltantes/);
});


test('a zero-shortage display does not claim delivery until each required line is issued', () => {
  assert.match(component, /const fullyDelivered\s*=\s*rows\.length > 0/);
  assert.match(component, /issued\(row\) >= required\(row\)/);
  assert.match(component, /Revisar cobertura y entrega/);
  assert.match(component, /Pendiente de verificar entrega/);
});
