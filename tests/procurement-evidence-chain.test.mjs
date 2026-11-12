import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/procurement/evidence-chain/route.ts', 'utf8');
const component = fs.readFileSync('components/procurement/procurement-evidence-chain.tsx', 'utf8');
const page = fs.readFileSync('app/dashboard/compras/flujo/page.tsx', 'utf8');

test('procurement evidence chain is scoped, read-only and bounded', () => {
  assert.match(route, /MODULE_KEYS\.FIN_COMPRAS/);
  assert.match(route, /getOrganizationContext/);
  assert.match(route, /count: 'exact', head: true/);
  assert.match(route, /readOnly: true/);
  assert.doesNotMatch(route, /insert\(/);
  assert.doesNotMatch(route, /update\(/);
  assert.doesNotMatch(route, /delete\(/);
});

test('historical purchase orders never become physical receipt evidence', () => {
  assert.match(route, /historical_evidence/);
  assert.match(route, /historicalReceiptPromoted: false/);
  assert.match(route, /historical_evidence is contextual evidence only and never proves physical receipt/);
  assert.match(component, /Historia útil, no recepción física/);
  assert.match(component, /no prueban que el material haya sido recibido/);
});

test('Laudus payment status stays source-wide and separate from deterministic MOTIL linkage', () => {
  assert.match(route, /laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(route, /linkage: 'source_wide_only'/);
  assert.match(route, /not deterministically attached to a MOTIL operational order/);
  assert.match(component, /no como enlace automático a una OC MOTIL/);
});

test('purchases workflow surfaces the evidence chain before progressive operations', () => {
  assert.match(page, /ProcurementEvidenceChain/);
  assert.match(page, /<ProcurementEvidenceChain \/>/);
  assert.match(component, /OC → recepción → factura → pago/);
});
