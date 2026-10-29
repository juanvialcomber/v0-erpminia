import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/inventory-readiness.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/inventory-readiness/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/integrations/laudus-inventory-readiness-card.tsx', import.meta.url), 'utf8');

test('inventory readiness makes Laudus primary only when the cross-source authority gate is clear', () => {
  assert.match(helper, /bodega_stock_source_authority_service_v1/);
  assert.match(helper, /primaryStockSource: laudusIsPrimary \? 'laudus'/);
  assert.match(helper, /laudusStockRole: 'primary_when_consistent'/);
  assert.match(helper, /motilOperationalStockRole: 'comparison_evidence'/);
  assert.match(helper, /crossSourceValidation: \['official_email', 'whatsapp'\]/);
  assert.match(helper, /autoOverwrite: false/);
});

test('inventory readiness reads safe public service projections instead of the private integration schema', () => {
  assert.match(helper, /laudus_inventory_readiness_service_v1/);
  assert.match(helper, /laudus_inventory_reconciliation_summary_service_v1/);
  assert.doesNotMatch(helper, /schema\('integration'\)/);
  assert.match(helper, /canonicalProductCoverage/);
  assert.match(helper, /quantityMismatches/);
  assert.match(helper, /missingInMotilNonzero/);
  assert.match(helper, /negativeProducts/);
  assert.match(helper, /stockIsStale/);
});

test('inventory readiness API is permission scoped and read-only', () => {
  assert.match(route, /BODEGA_INVENTARIO/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('reconciliation readiness uses the authority gate instead of treating legacy MOTIL deltas as authority conflicts', () => {
  assert.match(helper, /defaultAbsoluteTolerance: 0/);
  assert.match(helper, /requiresApprovedTolerance: true/);
  assert.match(helper, /waiting_laudus/);
  assert.match(helper, /ready_to_compare/);
  assert.match(helper, /authorityState/);
  assert.match(helper, /laudusIsPrimary/);
  assert.doesNotMatch(helper, /quantityMismatches > 0/);
  assert.doesNotMatch(helper, /missingInMotilNonzero > 0/);
});

test('UI exposes Laudus authority and cross-source reconciliation without auto-overwriting MOTIL', () => {
  assert.match(card, /Laudus es la fuente primaria de stock cuando está fresco/);
  assert.match(card, /Correo y WhatsApp actúan como contraste/);
  assert.match(card, /Fuente primaria: Laudus/);
  assert.match(card, /Fuente en revisión/);
  assert.match(card, /Productos Laudus elegibles enlazados al catálogo/);
  assert.match(card, /Saldos distintos entre MOTIL y Laudus/);
  assert.match(card, /SKU con saldo Laudus sin existencia MOTIL/);
  assert.match(card, /Bodegas físicas conciliadas con MOTIL/);
  assert.match(card, /Laudus primario · validación cruzada activa/);
  assert.match(card, /Conciliación activa · sin overwrite automático/);
});
