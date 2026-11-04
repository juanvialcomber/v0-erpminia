import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261104110500_align_purchase_order_supplier_resolution_with_laudus.sql','utf8');

test('purchase-order supplier resolution reuses only tax-verified Laudus identity', () => {
  assert.match(migration, /verified_laudus/);
  assert.match(migration, /regexp_replace\(lower\(coalesce\(cs\.tax_id/);
  assert.match(migration, /regexp_replace\(lower\(coalesce\(ls\.tax_id/);
  assert.match(migration, /tax_verified_laudus/);
  assert.match(migration, /lnm\.supplier_count = 1/);
});

test('supplier resolution remains read-only and does not mutate canonical or Laudus data', () => {
  assert.doesNotMatch(migration, /\binsert\b/i);
  assert.doesNotMatch(migration, /\bupdate\b/i);
  assert.doesNotMatch(migration, /\bdelete\b/i);
  assert.match(migration, /revoke all on integration\.purchase_order_reconciliation_preview_v1/);
  assert.match(migration, /grant select .* service_role/i);
});
