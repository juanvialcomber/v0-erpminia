import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/inventory-readiness.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/inventory-readiness/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/integrations/laudus-inventory-readiness-card.tsx', import.meta.url), 'utf8');

test('inventory readiness separates ERP evidence from operational stock authority', () => {
  assert.match(helper, /laudusStockRole: 'erp_evidence'/);
  assert.match(helper, /motilOperationalStockRole: 'operational_truth'/);
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

test('reconciliation readiness defaults to zero tolerance and flags stale or divergent Laudus evidence', () => {
  assert.match(helper, /defaultAbsoluteTolerance: 0/);
  assert.match(helper, /requiresApprovedTolerance: true/);
  assert.match(helper, /waiting_laudus/);
  assert.match(helper, /ready_to_compare/);
  assert.match(helper, /isOlderThanHours\(latestStockSync, 8\)/);
  assert.match(helper, /quantityMismatches > 0/);
  assert.match(helper, /missingInMotilNonzero > 0/);
});

test('UI exposes live Laudus differences without auto-overwriting MOTIL', () => {
  assert.match(card, /Laudus aporta catálogo, stock ERP y bodegas como evidencia/);
  assert.match(card, /MOTIL conserva por separado el stock operacional/);
  assert.match(card, /Productos Laudus elegibles enlazados al catálogo/);
  assert.match(card, /Saldos distintos entre MOTIL y Laudus/);
  assert.match(card, /SKU con saldo Laudus sin existencia MOTIL/);
  assert.match(card, /Bodegas físicas conciliadas con MOTIL/);
  assert.match(card, /Evidencia ERP · sin autoajuste de stock MOTIL/);
});
