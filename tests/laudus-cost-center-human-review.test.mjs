import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024104500_laudus_cost_center_human_review.sql','utf8');
const route=fs.readFileSync('app/api/cost-centers/laudus-review/route.ts','utf8');
const ui=fs.readFileSync('components/dashboard/laudus-cost-center-review-queue.tsx','utf8');

test('cost center review excludes discontinued history from active proposals',()=>{
  assert.match(migration,/active_pending as/);
  assert.match(migration,/where not discontinued/);
  assert.match(migration,/pending_discontinued/);
});

test('cost center proposals preserve hierarchy and exact asset evidence',()=>{
  assert.match(migration,/parent_operational_code/);
  assert.match(migration,/canonical_parent_id/);
  assert.match(migration,/exact_plate_asset_support/);
  assert.match(migration,/suggested_center_type/);
});

test('approval records intent without creating canonical centers',()=>{
  assert.doesNotMatch(migration,/insert into canonical\.cost_centers/i);
  assert.doesNotMatch(route,/\.from\('canonical\.cost_centers'\)/);
  assert.match(route,/canonicalMutated:false/);
  assert.match(ui,/no crean centros canónicos automáticamente/i);
});
