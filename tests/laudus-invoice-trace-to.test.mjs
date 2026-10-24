import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync('lib/integrations/laudus/purchase-invoice-traces.ts', 'utf8');
const route = fs.readFileSync('app/api/integrations/laudus/purchase-invoice-traces/sync/route.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261024081500_laudus_invoice_trace_to_semantics.sql', 'utf8');

test('invoice origin reader uses Laudus official traceTo endpoint', () => {
  assert.match(reader, /\/purchases\/invoices\/\$\{purchaseInvoiceId\}\/traceTo/);
  assert.match(reader, /toStep/);
  assert.match(reader, /toId/);
  assert.match(reader, /toDocNumber/);
  assert.match(route, /sourceEndpoint: '\/purchases\/invoices\/\{purchaseInvoiceId\}\/traceTo'/);
});

test('traceTo semantics are normalized before staging receives data', () => {
  assert.match(migration, /rename column from_step to origin_step/);
  assert.match(migration, /rename column from_id to origin_id/);
  assert.match(migration, /origin_doc_number/);
  assert.match(migration, /po\.laudus_purchase_order_id = t\.origin_id/);
  assert.match(migration, /wb\.laudus_purchase_waybill_id = t\.origin_id/);
});
