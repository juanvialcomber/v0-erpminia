import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const procurement = readFileSync(new URL('../lib/integrations/laudus/procurement-sync.ts', import.meta.url), 'utf8');
const journalWaybill = readFileSync(new URL('../lib/integrations/laudus/journal-waybill-sync.ts', import.meta.url), 'utf8');

test('procurement lists request explicit documented projections instead of empty fields', () => {
  assert.match(procurement, /const SUPPLIER_FIELDS = \[/);
  assert.match(procurement, /'supplierId'/);
  assert.match(procurement, /'term\.termId'/);
  assert.match(procurement, /fields: \[\.\.\.SUPPLIER_FIELDS\]/);
  assert.match(procurement, /const ORDER_FIELDS = \[/);
  assert.match(procurement, /'purchaseOrderId'/);
  assert.match(procurement, /'supplier\.supplierId'/);
  assert.match(procurement, /'items\.product\.sku'/);
  assert.match(procurement, /'items\.unitCost'/);
  assert.match(procurement, /const INVOICE_FIELDS = \[/);
  assert.match(procurement, /'purchaseInvoiceId'/);
  assert.match(procurement, /'totals\.VAT'/);
  assert.match(procurement, /const PAYMENT_FIELDS = \[/);
  assert.match(procurement, /'paymentId'/);
  assert.match(procurement, /'purchaseInvoices\.purchaseInvoiceId'/);
  assert.match(procurement, /'purchaseInvoices\.costCenter\.costCenterId'/);
  assert.match(procurement, /fields: \[\.\.\.fields\]/);
});

test('journal entries and waybills request explicit documented projections', () => {
  assert.match(journalWaybill, /const ACCOUNTING_ENTRY_FIELDS = \[/);
  assert.match(journalWaybill, /'journalEntryId'/);
  assert.doesNotMatch(journalWaybill.match(/const ACCOUNTING_ENTRY_FIELDS = \[[\s\S]*?\] as const;/)?.[0] || '', /'lines'/);
  assert.match(journalWaybill, /const WAYBILL_FIELDS = \[/);
  assert.match(journalWaybill, /'purchaseWaybillId'/);
  assert.match(journalWaybill, /'supplier\.supplierId'/);
  assert.match(journalWaybill, /'items\.product\.sku'/);
  assert.match(journalWaybill, /fields: \[\.\.\.fields\]/);
});

test('list response normalization accepts nested and flattened Laudus shapes', () => {
  assert.match(procurement, /function readField/);
  assert.match(procurement, /normalizePurchaseRows/);
  assert.match(procurement, /unitPrice: readField\(row, 'items\.unitCost'\)/);
  assert.match(journalWaybill, /function readField/);
  assert.match(journalWaybill, /items_product_sku/);
});

test('422 diagnostics preserve endpoint and status without adding writes', () => {
  for (const source of [procurement, journalWaybill]) {
    assert.match(source, /error instanceof LaudusApiError/);
    assert.match(source, /path: error\.path/);
    assert.match(source, /status: error\.status/);
    assert.doesNotMatch(source, /createLaudus|updateLaudus|deleteLaudus|putLaudus/);
  }
});
