import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Bodega presents Laudus as live ERP evidence, not a pending integration', () => {
  const page = fs.readFileSync('app/dashboard/bodega/page.tsx', 'utf8');
  const card = fs.readFileSync('components/integrations/laudus-inventory-readiness-card.tsx', 'utf8');
  const readiness = fs.readFileSync('lib/integrations/laudus/inventory-readiness.ts', 'utf8');

  assert.doesNotMatch(page, /pendiente de habilitación comercial de API/i);
  assert.doesNotMatch(page, /Esperando acceso y primera sincronización/i);
  assert.match(card, /Laudus aporta catálogo, stock ERP y bodegas como evidencia/);
  assert.match(card, /MOTIL conserva por separado el stock operacional/);
  assert.match(card, /mappedPhysicalWarehouses/);
  assert.match(card, /latestStockSync/);
  assert.match(readiness, /schema\('integration'\).*laudus_products/s);
  assert.match(readiness, /laudus_product_stock/);
  assert.match(readiness, /openReconciliation/);
  assert.match(readiness, /\.in\('entity_type', \['product', 'stock'\]\)/);
  assert.match(readiness, /laudus_warehouses/);
  assert.match(readiness, /unresolvedWarehouses/);
  assert.match(readiness, /laudusStockRole: 'erp_evidence'/);
  assert.match(readiness, /motilOperationalStockRole: 'operational_truth'/);
  assert.match(readiness, /autoOverwrite: false/);
});

test('data quality surfaces unresolved Laudus warehouses without auto-linking them', () => {
  const route = fs.readFileSync('app/api/data-quality/reconciliation/route.ts', 'utf8');

  assert.match(route, /laudus_warehouses/);
  assert.match(route, /new_candidate/);
  assert.match(route, /Bodega física Laudus pendiente de revisión humana/);
  assert.match(route, /No se crea, fusiona ni enlaza automáticamente/);
  assert.match(route, /warehouse_candidate_proposed_match_name/);
});
