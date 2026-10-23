import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/integrations/laudus/match-reviews/route.ts','utf8');
const inbox=fs.readFileSync('components/integrations/laudus-match-review-inbox.tsx','utf8');
const sql=fs.readFileSync('supabase/migrations/20261023231500_measure_laudus_review_value.sql','utf8');

test('review telemetry is non-canonical and backend-only',()=>{
  assert.match(sql,/laudus_match_review_events/);
  assert.match(sql,/enable row level security/);
  assert.match(sql,/grant select, insert .* service_role/);
  assert.match(route,/event === 'shown'/);
  assert.match(route,/review_duration_ms/);
  assert.match(route,/sourceModified: false/);
  assert.match(route,/canonicalModified: false/);
});

test('rejections are structured for measurable learning without auto-scoring',()=>{
  assert.match(route,/wrong_order/);
  assert.match(route,/quantity_mismatch/);
  assert.match(route,/price_mismatch/);
  assert.match(route,/insufficient_evidence/);
  assert.match(inbox,/Otra OC/);
  assert.match(inbox,/Tiempo medio/);
});
