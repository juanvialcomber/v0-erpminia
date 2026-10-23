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

test('inventory readiness measures product identity, physical count, movements and snapshot anomalies', () => {
  assert.match(helper, /productCoverage/);
  assert.match(helper, /physicalCountCoverage/);
  assert.match(helper, /movementCount/);
  assert.match(helper, /negativeRows/);
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

test('UI states that Laudus cannot overwrite operational or physical stock automatically', () => {
  assert.match(card, /saldo ERP y movimientos como evidencia/);
  assert.match(card, /no reemplazará automáticamente el stock operacional ni un conteo físico/);
  assert.match(card, /Tolerancia base 0/);
  assert.match(card, /sin autoajuste/);
});
