import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Bodega presents Laudus as live ERP evidence, not a pending integration', () => {
  const page = fs.readFileSync('app/dashboard/bodega/page.tsx', 'utf8');
  const card = fs.readFileSync('components/integrations/laudus-inventory-readiness-card.tsx', 'utf8');
  const readiness = fs.readFileSync('lib/integrations/laudus/inventory-readiness.ts', 'utf8');

  assert.doesNotMatch(page, /pendiente de habilitación comercial de API/i);
  assert.doesNotMatch(page, /Esperando acceso y primera sincronización/i);
  assert.match(card, /Laudus es la fuente primaria de stock cuando está fresco/);
  assert.match(card, /Correo y WhatsApp actúan como contraste/);
  assert.match(card, /mappedPhysicalWarehouses/);
  assert.match(card, /latestStockSync/);
  assert.match(readiness, /laudus_inventory_readiness_service_v1/);
  assert.match(readiness, /laudus_inventory_reconciliation_summary_service_v1/);
  assert.doesNotMatch(readiness, /schema\('integration'\)/);
  assert.match(readiness, /openReconciliation/);
  assert.match(readiness, /quantityMismatches/);
  assert.match(readiness, /missingInMotilNonzero/);
  assert.match(readiness, /bodega_stock_source_authority_service_v1/);
  assert.match(readiness, /laudusStockRole: 'primary_when_consistent'/);
  assert.match(readiness, /motilOperationalStockRole: 'comparison_evidence'/);
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


test('Bodega displays Laudus stock and quantity deltas per visible SKU', () => {
  const page = fs.readFileSync('app/dashboard/bodega/page.tsx', 'utf8');
  const route = fs.readFileSync('app/api/inventory/intelligence/route.ts', 'utf8');

  assert.match(route, /laudus_inventory_reconciliation_service_v1/);
  assert.match(route, /laudus_inventory_reconciliation_summary_service_v1/);
  assert.match(route, /laudus_quantity_delta/);
  assert.match(route, /reconciliation_state/);
  assert.match(page, /Laudus ERP/);
  assert.match(page, /Difiere Laudus/);
  assert.match(page, /Δ MOTIL − Laudus/);
  assert.doesNotMatch(page, /Referencia canónica más reciente/);
});


test('Laudus becomes the effective displayed quantity only when the authority gate passes', () => {
  const page = fs.readFileSync('app/dashboard/bodega/page.tsx', 'utf8');
  const route = fs.readFileSync('app/api/inventory/intelligence/route.ts', 'utf8');

  assert.match(route, /bodega_stock_source_authority_service_v1/);
  assert.match(route, /effective_quantity/);
  assert.match(route, /effective_source/);
  assert.match(route, /laudusIsPrimary/);
  assert.match(page, /Fuente: Laudus/);
  assert.match(page, /Laudus primario/);
});
