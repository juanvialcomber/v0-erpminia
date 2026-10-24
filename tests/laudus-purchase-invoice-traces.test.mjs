import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync('lib/integrations/laudus/purchase-invoice-traces.ts', 'utf8');
const route = fs.readFileSync('app/api/integrations/laudus/purchase-invoice-traces/sync/route.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261024074500_laudus_purchase_invoice_item_traces.sql', 'utf8');

test('invoice trace reader uses the official Laudus traceTo endpoint', () => {
  assert.match(reader, /\/purchases\/invoices\/\$\{purchaseInvoiceId\}\/traceTo/);
  assert.match(reader, /toStep/);
  assert.match(reader, /toId/);
  assert.match(reader, /toDocNumber/);
});

test('invoice trace sync is bounded, admin scoped and read only', () => {
  assert.match(route, /MAX_LIMIT = 25/);
  assert.match(route, /if \(!access\.admin\)/);
  assert.match(route, /canonicalMutated: false/);
  assert.match(route, /laudusMutated: false/);
});

test('invoice traces remain staging evidence and do not mutate canonical procurement', () => {
  assert.match(migration, /integration\.laudus_purchase_invoice_item_traces/);
  assert.match(migration, /integration\.laudus_purchase_invoice_trace_sync/);
  assert.match(migration, /motil_get_laudus_invoice_trace_candidates/);
  assert.match(migration, /motil_ingest_laudus_invoice_traces/);
  assert.doesNotMatch(migration, /insert into public\.procurement_operational/i);
  assert.doesNotMatch(migration, /update public\.procurement_/i);
  assert.match(migration, /canonical_mutated', false/);
  assert.match(migration, /laudus_mutated', false/);
});
