import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const lib=await readFile(new URL('../lib/legal/contract-invoice-trace-sync.ts',import.meta.url),'utf8');
const procurement=await readFile(new URL('../lib/integrations/laudus/procurement-sync.ts',import.meta.url),'utf8');
const migration=await readFile(new URL('../supabase/migrations/20261107012500_laudus_invoice_trace_status_v1.sql',import.meta.url),'utf8');

test('Legal invoice trace recovery is bounded and exact',()=>{
 assert.match(lib,/MAX_LEGAL_TRACE_RECOVERY = 8/);
 assert.match(lib,/supplierTaxByExternalId/);
 assert.match(lib,/expectedRut/);
 assert.match(lib,/String\(row\.doc_number \|\| ''\)\.trim\(\) === ref\.docNumber/);
 assert.match(lib,/Number\(row\.total_amount \|\| 0\) > 0/);
 assert.match(lib,/matches\.length === 1/);
 assert.match(lib,/matches\.length > 1/);
});

test('Legal invoice trace recovery reuses persisted trace status and skips already-synced invoices',()=>{
 assert.match(lib,/motil_get_laudus_invoice_trace_status_v1/);
 assert.match(lib,/alreadySynced/);
 assert.match(lib,/status === 'complete'/);
 assert.match(migration,/organization_id=p_organization_id/);
 assert.match(migration,/grant execute .* service_role/i);
});

test('Legal invoice trace recovery only writes staging evidence',()=>{
 assert.match(lib,/motil_ingest_laudus_invoice_rows/);
 assert.match(lib,/motil_ingest_laudus_invoice_traces/);
 assert.match(lib,/canonicalMutationExecuted: false/);
 assert.match(lib,/laudusMutationExecuted: false/);
 assert.match(lib,/stagingOnly: true/);
 assert.doesNotMatch(lib,/POST|PUT|PATCH|DELETE/);
});

test('procurement sync recovers Legal trace without making the core sync depend on it',()=>{
 assert.match(procurement,/syncLegalContractInvoiceTraces/);
 assert.match(procurement,/legalTraceRecoveryError/);
 assert.match(procurement,/console\.error\('\[laudus\/procurement:legal-trace-recovery\]'/);
 assert.match(procurement,/apiCalls \+= Number\(legalTraceRecovery\.apiCalls/);
});
