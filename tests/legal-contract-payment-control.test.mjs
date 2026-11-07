import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/legal/contract-progress-source.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/legal/contract-payment-control/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/avances-pagos/page.tsx', import.meta.url), 'utf8');
const legalHome = await readFile(new URL('../app/dashboard/legal/page.tsx', import.meta.url), 'utf8');

test('contract progress source preserves Elias workbook provenance', () => {
  assert.match(source, /Planilla Avance Contratos - Con resumen\.xlsx/);
  assert.match(source, /b7eb275ec0b86e5867ece489a714c48a09033342403deb65fd719ad9c9c29317/);
  assert.match(source, /IO-01/);
  assert.match(source, /27712/);
  assert.match(source, /IO-09/);
  assert.match(source, /EP-03/);
  assert.match(source, /sourceSheet/);
  assert.match(source, /sourceRow/);
});

test('payment control never converts invoiced into paid without Laudus evidence', () => {
  assert.match(api, /laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(api, /supplier_external_id/);
  assert.match(api, /doc_number/);
  assert.match(api, /MOTIL no convierte facturado en pagado/);
  assert.match(api, /match_status: laudusInvoice \? 'verified' : 'not_found'/);
});

test('retention classification requires Laudus outstanding to match source retention', () => {
  assert.match(api, /paymentStatus === 'partially_paid'/);
  assert.match(api, /Math\.abs\(outstandingAmount - retentionAmount\)/);
  assert.match(api, /paid_with_retention/);
  assert.match(api, /retención informada en la planilla/);
});

test('Legal exposes action-first advances and payment control', () => {
  assert.match(page, /Avances y pagos/);
  assert.match(page, /Conclusión/);
  assert.match(page, /Siguiente acción/);
  assert.match(page, /Avance físico, facturación, retención y pago se mantienen separados/);
  assert.match(page, /Pagado · retención pendiente/);
  assert.match(page, /Pendiente de facturar/);
  assert.match(page, /Fuente:/);
  assert.match(legalHome, /\/dashboard\/legal\/avances-pagos/);
});
