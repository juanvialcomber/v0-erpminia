import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/procurement/laudus-invoices/route.ts', 'utf8');
const ui = fs.readFileSync('components/procurement/progressive-invoice-workflow.tsx', 'utf8');

test('Compras exposes Laudus invoice evidence through a bounded read-only route', () => {
  assert.match(route, /MODULE_KEYS\.FIN_COMPRAS/);
  assert.match(route, /laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(route, /const MAX_ROWS = 20/);
  assert.match(route, /sourceInvoiceIsNotMotilOperationalInvoice: true/);
  assert.match(route, /sourcePaymentStatusIsNotMotilPaymentApproval: true/);
  assert.match(route, /sourceInvoiceIsNotThreeWayMatch: true/);
  assert.match(route, /canonicalMutationExecuted: false/);
  assert.match(route, /laudusMutationExecuted: false/);
  assert.doesNotMatch(route, /schema\('integration'\)/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test('Facturas keeps Laudus source evidence separate from the MOTIL operational workflow', () => {
  assert.match(ui, /\/api\/procurement\/laudus-invoices/);
  assert.match(ui, /Facturas Laudus/);
  assert.match(ui, /Facturas MOTIL/);
  assert.match(ui, /no se convierte automáticamente en factura operacional MOTIL/);
  assert.match(ui, /three-way match ni aprobación de pago/);
  assert.match(ui, /El universo fuente permanece en Laudus y no se duplica en MOTIL/);
});
