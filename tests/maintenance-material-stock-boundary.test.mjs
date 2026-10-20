import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const catalog = await readFile(new URL('../app/api/maintenance/material-catalog/route.ts', import.meta.url), 'utf8');
const coverage = await readFile(new URL('../components/maintenance/work-order-material-coverage.tsx', import.meta.url), 'utf8');
const createWorkOrder = await readFile(new URL('../components/maintenance/create-work-order.tsx', import.meta.url), 'utf8');

test('maintenance material catalog separates product identity informed stock and reservable stock', () => {
  assert.match(catalog, /canonical_products_v1/);
  assert.match(catalog, /bodega_inventory/);
  assert.match(catalog, /warehouse_stock/);
  assert.match(catalog, /informedQuantity/);
  assert.match(catalog, /reservableQuantity/);
  assert.match(catalog, /stockSignalSource/);
  assert.match(catalog, /reservationSource/);
});

test('La Patagua stock signal remains advisory and tenant identity remains canonical', () => {
  assert.match(catalog, /LA_PATAGUA_ORGANIZATION_ID/);
  assert.match(catalog, /eq\('organization_id', context\.organizationId\)/);
  assert.match(catalog, /stockSignal: context\.organizationId === LA_PATAGUA_ORGANIZATION_ID/);
});

test('material editor tells planner that availability and reservation are distinct', () => {
  assert.match(coverage, /Stock informado/);
  assert.match(coverage, /Reservable ahora/);
  assert.match(coverage, /La reserva real se confirma sólo al agregar el material a la OT/);
  assert.match(coverage, /item\.informedStatus === 'conflict'/);
  assert.match(coverage, /item\.informedQuantity/);
  assert.match(coverage, /Reservable \{item\.reservableQuantity/);
});


test('OT creation shows advisory stock and canonical reservation separately', () => {
  assert.match(createWorkOrder, /Informado: En conciliación/);
  assert.match(createWorkOrder, /item\.informedQuantity/);
  assert.match(createWorkOrder, /Reservable \{item\.reservableQuantity/);
  assert.match(createWorkOrder, /Con reserva posible/);
  assert.match(createWorkOrder, /la reserva se intenta contra Bodega canónica/);
  assert.doesNotMatch(createWorkOrder, /quantityAvailable/);
});


test('OT material coverage uses informed Bodega stock as a confirmation gate before procurement', async () => {
  const route = await readFile(new URL('../app/api/maintenance/work-orders/[id]/materials/route.ts', import.meta.url), 'utf8');
  assert.match(route, /informed_available/);
  assert.match(route, /advisory_confirmation_before_procurement/);
  assert.match(coverage, /Confirmar Bodega antes de Compras/);
  assert.match(coverage, /informedCoveragePending/);
  assert.match(coverage, /no tienen cobertura reservada, entregada ni señal suficiente en Bodega/);
});


test('conflicted Bodega evidence remains visible but cannot cover an OT shortage', async () => {
  const trust = await readFile(new URL('../lib/inventory-trust.ts', import.meta.url), 'utf8');
  const materialsRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/materials/route.ts', import.meta.url), 'utf8');
  assert.match(trust, /Combustible001/);
  assert.match(materialsRoute, /informed_status: conflict \? 'conflict'/);
  assert.match(coverage, /row\.informed_status === 'conflict'/);
  assert.match(coverage, /En conciliación/);
  assert.match(createWorkOrder, /Informado: En conciliación/);
});
