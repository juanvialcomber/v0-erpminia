import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/integrations/laudus/inventory-reconciliation-review/route.ts', import.meta.url);
const uiPath = new URL('../components/integrations/laudus-inventory-reconciliation-queue.tsx', import.meta.url);

test('Bodega review enriches Laudus stock cases from public MOTIL evidence', async () => {
  const route = await readFile(routePath, 'utf8');
  assert.match(route, /canonical_inventory_current/);
  assert.match(route, /product_procurement_status/);
  assert.match(route, /motilSnapshot/);
  assert.match(route, /procurement:/);
  assert.doesNotMatch(route, /schema\('canonical'\)/);
});

test('Bodega review exposes context without changing the decision policy', async () => {
  const ui = await readFile(uiPath, 'utf8');
  assert.match(ui, /Último snapshot MOTIL/);
  assert.match(ui, /Historial de compras/);
  assert.match(ui, /La decisión humana queda registrada y no cambia stock automáticamente/);
  assert.match(ui, /Aprobar significa aceptar la evidencia Laudus/);
});
