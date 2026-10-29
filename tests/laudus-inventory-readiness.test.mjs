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

test('inventory readiness measures live Laudus identity, stock, warehouses and open reconciliation', () => {
  assert.match(helper, /canonicalProductCoverage/);
  assert.match(helper, /inventory_eligibility', 'eligible'/);
  assert.match(helper, /eligibleProducts/);
  assert.match(helper, /excludedProducts/);
  assert.match(helper, /canonicalProductCoverage: pct\(laudusEligibleProductsLinked, laudusEligibleProducts\)/);
  assert.match(helper, /laudusStockRows/);
  assert.match(helper, /mappedPhysicalWarehouses/);
  assert.match(helper, /latestLaudusStock/);
  assert.match(helper, /openReconciliation/);
});

test('inventory readiness API is permission scoped and read-only', () => {
  assert.match(route, /BODEGA_INVENTARIO/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('reconciliation readiness defaults to zero tolerance and waits for verified Laudus data', () => {
  assert.match(helper, /defaultAbsoluteTolerance: 0/);
  assert.match(helper, /requiresApprovedTolerance: true/);
  assert.match(helper, /waiting_laudus/);
  assert.match(helper, /ready_to_compare/);
});

test('UI states that Laudus is live ERP evidence and cannot overwrite operational stock', () => {
  assert.match(card, /Laudus aporta catálogo, stock ERP y bodegas como evidencia/);
  assert.match(card, /MOTIL conserva por separado el stock operacional/);
  assert.match(card, /Productos Laudus elegibles enlazados al catálogo/);
  assert.match(card, /fuera de alcance/);
  assert.match(card, /Posiciones producto-bodega Laudus/);
  assert.match(card, /Bodegas físicas conciliadas con MOTIL/);
  assert.match(card, /sin autoajuste/);
});
