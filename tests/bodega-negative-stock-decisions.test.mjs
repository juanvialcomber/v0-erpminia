import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/inventory/negative-stock-decisions/route.ts', 'utf8');
const page = fs.readFileSync('app/dashboard/bodega/page.tsx', 'utf8');

test('negative stock decisions are read-only against canonical inventory', () => {
  assert.match(route, /laudus_inventory_reconciliation_service_v1/);
  assert.match(route, /data_reconciliation_reviews/);
  assert.doesNotMatch(route, /update\([^)]*inventory/i);
  assert.doesNotMatch(route, /insert\([^)]*inventory/i);
});

test('negative stock decisions require Bodega write access before feedback', () => {
  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.BODEGA_INVENTARIO, true\)/);
  assert.match(route, /La excepción ya no está activa/);
});

test('Bodega exposes decision-assisted review for negative stock', () => {
  assert.match(page, /negative-stock-decisions/);
  assert.match(page, /Prioridad por impacto/);
  assert.match(page, /Requiere ajuste Laudus/);
  assert.match(page, /Falta registrar movimiento/);
});
