import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const procurement = readFileSync(new URL('../lib/integrations/laudus/procurement-sync.ts', import.meta.url), 'utf8');
const journalWaybill = readFileSync(new URL('../lib/integrations/laudus/journal-waybill-sync.ts', import.meta.url), 'utf8');

test('procurement lists request explicit documented projections instead of empty fields', () => {
  assert.match(procurement, /const ORDER_FIELDS = \[/);
  assert.match(procurement, /'purchaseOrderId'/);
  assert.match(procurement, /'supplier'/);
  assert.match(procurement, /'items'/);
  assert.match(procurement, /const INVOICE_FIELDS = \[/);
  assert.match(procurement, /'purchaseInvoiceId'/);
  assert.match(procurement, /'totals'/);
  assert.match(procurement, /const PAYMENT_FIELDS = \[/);
  assert.match(procurement, /'paymentId'/);
  assert.match(procurement, /'purchaseInvoices'/);
  assert.match(procurement, /fields: \[\.\.\.fields\]/);
});

test('journal entries and waybills request explicit documented projections', () => {
  assert.match(journalWaybill, /const ACCOUNTING_ENTRY_FIELDS = \[/);
  assert.match(journalWaybill, /'journalEntryId'/);
  assert.match(journalWaybill, /'lines'/);
  assert.match(journalWaybill, /const WAYBILL_FIELDS = \[/);
  assert.match(journalWaybill, /'purchaseWaybillId'/);
  assert.match(journalWaybill, /'items'/);
  assert.match(journalWaybill, /fields: \[\.\.\.fields\]/);
});

test('422 diagnostics preserve endpoint and status without adding writes', () => {
  for (const source of [procurement, journalWaybill]) {
    assert.match(source, /error instanceof LaudusApiError/);
    assert.match(source, /path: error\.path/);
    assert.match(source, /status: error\.status/);
    assert.doesNotMatch(source, /createLaudus|updateLaudus|deleteLaudus|putLaudus/);
  }
});
