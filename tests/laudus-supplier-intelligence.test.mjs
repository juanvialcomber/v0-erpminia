import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024090000_laudus_supplier_intelligence.sql','utf8');
const api=fs.readFileSync('app/api/finance/suppliers/[id]/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/finanzas/proveedores/[id]/page.tsx','utf8');

test('supplier intelligence is canonical-supplier and tenant scoped',()=>{
  assert.match(migration,/p_organization_id uuid/);
  assert.match(migration,/p_canonical_supplier_id uuid/);
  assert.match(migration,/canonical_supplier_id=p_canonical_supplier_id/);
  assert.match(migration,/organization_id=p_organization_id/);
});

test('price movement compares latest price with prior median for same product and unit',()=>{
  assert.match(migration,/partition by l\.product_external_id,coalesce\(l\.unit,''\)/);
  assert.match(migration,/percentile_cont\(0\.5\)/);
  assert.match(migration,/baseline_count>=2/);
  assert.match(migration,/price_change_pct/);
});

test('supplier intelligence remains read only',()=>{
  assert.match(migration,/canonical_mutated',false/);
  assert.match(migration,/laudus_mutated',false/);
  assert.doesNotMatch(migration,/insert into canonical/i);
  assert.doesNotMatch(migration,/update integration\.laudus_/i);
});

test('supplier profile degrades gracefully when Laudus intelligence is unavailable',()=>{
  assert.match(api,/console\.warn\('\[finance\/supplier\/laudus-intelligence\]'/);
  assert.match(api,/laudusIntelligence: laudusIntelligenceResult\.error \? null/);
  assert.match(page,/Una variación no implica anomalía/);
});
