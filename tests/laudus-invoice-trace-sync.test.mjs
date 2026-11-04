import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lib = fs.readFileSync('lib/integrations/laudus/invoice-trace-sync.ts','utf8');
const route = fs.readFileSync('app/api/integrations/laudus/native-invoice-trace/sync/route.ts','utf8');

test('invoice trace sync is bounded and persists source evidence only',()=>{
  assert.match(lib,/MAX_INVOICES = 5/);
  assert.match(lib,/MAX_CALLS = 10/);
  assert.match(lib,/motil_get_laudus_invoice_trace_candidates/);
  assert.match(lib,/motil_ingest_laudus_invoice_traces/);
  assert.match(lib,/motil_laudus_invoice_trace_coverage/);
  assert.match(lib,/sourceTracePersistedAsEvidenceOnly: true/);
  assert.match(lib,/sourceTraceIsNotPurchaseOrderConfirmation: true/);
  assert.match(lib,/sourceTraceIsNotPaymentApproval: true/);
  assert.match(lib,/canonicalMutationExecuted: false/);
  assert.match(lib,/laudusMutationExecuted: false/);
});

test('invoice trace sync endpoint remains Finance write-authorized and tracked',()=>{
  assert.match(route,/MODULE_KEYS\.FIN_FINANZAS, true/);
  assert.match(route,/withLaudusApiUsageTracking/);
  assert.match(route,/syncLaudusInvoiceTraceEvidence/);
});
