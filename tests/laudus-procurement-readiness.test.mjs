import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/procurement-readiness.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/procurement-readiness/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/integrations/laudus-procurement-readiness-card.tsx', import.meta.url), 'utf8');

test('procurement readiness measures headers and lines separately', () => {
  assert.match(helper, /orders:/);
  assert.match(helper, /lines:/);
  assert.match(helper, /supplierCoverage/);
  assert.match(helper, /productCoverage/);
  assert.match(helper, /unitCoverage/);
  assert.match(helper, /receivedCoverage/);
});

test('procurement readiness measures downstream receipt invoice payable and payment flow', () => {
  assert.match(helper, /flow:/);
  assert.match(helper, /receiptOrderCoverage/);
  assert.match(helper, /invoiceOrderCoverage/);
  assert.match(helper, /payableInvoiceCoverage/);
  assert.match(helper, /paymentPayableCoverage/);
  assert.match(helper, /dteInvoiceCoverage/);
});

test('procurement readiness is read-only and permission scoped', () => {
  assert.match(route, /requireModuleAccess/);
  assert.match(route, /FIN_COMPRAS/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('runtime readiness uses public service views instead of private canonical schema access', () => {
  assert.match(helper, /canonical_purchase_orders_service_v1/);
  assert.match(helper, /canonical_purchase_order_lines_service_v1/);
  assert.doesNotMatch(helper, /\.schema\(['"]canonical['"]\)/);
});

test('UI communicates gaps without inventing data', () => {
  assert.match(card, /Preparación histórica para Laudus/);
  assert.match(card, /Proveedor enlazado/);
  assert.match(card, /Unidad de compra/);
  assert.match(card, /Flujo recepción → factura → pago/);
  assert.match(card, /DTE importados/);
  assert.match(card, /no completa proveedores, centros de costo ni unidades por inferencia/);
});
