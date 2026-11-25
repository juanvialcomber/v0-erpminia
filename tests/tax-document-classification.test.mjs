import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyTaxDocument, taxDocumentCounterparty } from '../lib/finance/tax-document-classification.mjs';

const company = '84542800-K';
const supplier = '76000000-0';

test('DTE 33 and 34 derive received or issued direction from both parties', () => {
  assert.equal(classifyTaxDocument(33, supplier, company, company), 'inbound_invoice');
  assert.equal(classifyTaxDocument('34', company, supplier, company), 'outbound_invoice');
});

test('DTE 46 is a purchase when La Patagua is the XML issuer', () => {
  const direction = classifyTaxDocument('46', company, supplier, company);
  assert.equal(direction, 'purchase_invoice_issued');
  assert.equal(taxDocumentCounterparty(direction, company, supplier), supplier);
});

test('DTE 46 with La Patagua as receiver is held as a role conflict', () => {
  assert.equal(classifyTaxDocument('Factura de Compra Electrónica', supplier, company, company), 'purchase_invoice_role_conflict');
});

test('DTE 52 is a waybill and unrelated documents stay unclassified', () => {
  assert.equal(classifyTaxDocument('52', supplier, company, company), 'waybill');
  assert.equal(classifyTaxDocument('61', supplier, company, company), 'other');
  assert.equal(classifyTaxDocument('33', supplier, '11111111-1', company), 'other');
});
