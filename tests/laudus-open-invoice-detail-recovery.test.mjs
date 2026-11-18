import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lib = fs.readFileSync('lib/integrations/laudus/open-invoice-detail-recovery.ts','utf8');
const route = fs.readFileSync('app/api/integrations/laudus/open-invoice-detail-recovery/route.ts','utf8');

test('open invoice detail recovery is budget aware and bounded', () => {
  assert.match(lib, /MAX_OPEN_INVOICE_DETAILS_PER_RUN = 12/);
  assert.match(lib, /MIN_LAUDUS_API_BUDGET_RESERVE = 200/);
  assert.match(lib, /monthly_remaining_exact/);
  assert.match(lib, /remaining - MIN_LAUDUS_API_BUDGET_RESERVE/);
  assert.match(lib, /slice\(0, limit\)/);
});

test('recovery targets only open invoices without local lines', () => {
  assert.match(lib, /payment_status', \['unpaid', 'partially_paid'\]/);
  assert.match(lib, /laudus_purchase_invoice_lines/);
  assert.match(lib, /!existingLineInvoiceIds\.has/);
  assert.match(lib, /motil_ingest_laudus_invoice_rows/);
});

test('recovery remains staging only and never mutates Laudus or canonical state', () => {
  assert.match(lib, /canonicalMutationExecuted: false/);
  assert.match(lib, /laudusMutationExecuted: false/);
  assert.match(lib, /stagingOnly: true/);
  assert.match(lib, /evidencePolicy: 'detail_rows_only'/);
  assert.doesNotMatch(lib, /POST.*api\.laudus/i);
  assert.doesNotMatch(lib, /\.update\(/);
  assert.doesNotMatch(lib, /\.delete\(/);
});

test('recovery route requires writable Compras access and server-side tracking', () => {
  assert.match(route, /MODULE_KEYS\.FIN_COMPRAS, true/);
  assert.match(route, /access\.canWrite/);
  assert.match(route, /getSupabaseServerClient/);
  assert.match(route, /withLaudusApiUsageTracking/);
  assert.match(route, /maxPerRun: 12/);
  assert.match(route, /minimumApiReserve: 200/);
});


test('recovery prioritizes invoices that have plausible Laudus PO context', () => {
  assert.match(lib, /laudus_purchase_orders/);
  assert.match(lib, /180 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(lib, /hasCandidatePurchaseOrder/);
  assert.match(lib, /prioritized\.slice\(0, limit\)/);
  assert.match(lib, /elegiblesConOcCandidata/);
});
