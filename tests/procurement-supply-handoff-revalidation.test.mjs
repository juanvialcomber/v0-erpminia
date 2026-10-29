import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/procurement/supply-needs/route.ts', 'utf8');
const page = fs.readFileSync('app/dashboard/compras/page.tsx', 'utf8');
const panel = fs.readFileSync('components/procurement/pending-maintenance-supply-needs.tsx', 'utf8');

test('supply handoff revalidates current Laudus stock before creating procurement intake', () => {
  assert.match(route, /bodega_stock_source_authority_service_v1/);
  assert.match(route, /laudus_inventory_reconciliation_service_v1/);
  assert.match(route, /SUPPLY_NEED_ALREADY_COVERED/);
  assert.match(route, /El faltante histórico ya está cubierto por stock Laudus/);
  assert.match(route, /convert_supply_need_to_intake_request/);
});

test('Compras shows revalidated maintenance needs before the operational pipeline', () => {
  assert.match(page, /PendingMaintenanceSupplyNeeds/);
  assert.match(panel, /MOTIL vuelve a validar stock actual antes de crear una solicitud de compra/);
  assert.match(panel, /Conciliar antes de comprar/);
  assert.match(panel, /Enviar a Compras/);
});

test('covered historical shortages cannot be handed off from the UI', () => {
  assert.match(panel, /covered \? <Button[^>]*disabled>Conciliar antes de comprar/);
});