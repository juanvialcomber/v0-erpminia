import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261109001500_motil_bank_evidence_readiness_v2.sql', import.meta.url),
  'utf8',
);

test('bank readiness accepts dated MOTIL bank evidence without claiming reconciliation', () => {
  assert.match(migration, /public\.module_documents/);
  assert.match(migration, /document_type_category\s*=\s*'Cartola bancaria'/);
  assert.match(migration, /valid_until is not null/);
  assert.match(migration, /motil_document/);
  assert.match(migration, /reconciliation_still_requires_human_review/);
  assert.match(migration, /true as reconciliation_still_requires_human_review/);
});

test('bank readiness keeps deposited separate from bank reconciliation', () => {
  assert.match(migration, /count\(\*\) filter \(where deposited = true\)/);
  assert.doesNotMatch(migration, /update\s+integration\.laudus_purchase_payments/i);
  assert.doesNotMatch(migration, /update\s+public\.module_documents/i);
  assert.doesNotMatch(migration, /insert\s+into\s+integration\.laudus_purchase_payments/i);
});

test('bank readiness remains service-role only', () => {
  assert.match(migration, /with \(security_invoker = true\)/i);
  assert.match(migration, /revoke all on public\.laudus_bank_reconciliation_readiness_v1 from public, anon, authenticated/i);
  assert.match(migration, /grant select on public\.laudus_bank_reconciliation_readiness_v1 to service_role/i);
});
