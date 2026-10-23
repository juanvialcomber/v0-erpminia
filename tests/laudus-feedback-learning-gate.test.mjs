import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route=fs.readFileSync('app/api/integrations/laudus/match-reviews/route.ts','utf8');
const inbox=fs.readFileSync('components/integrations/laudus-match-review-inbox.tsx','utf8');
const sql=fs.readFileSync('supabase/migrations/20261023224500_expand_laudus_feedback_pool.sql','utf8');

test('review queue remains bounded but does not exhaust after twelve labels',()=>{
  assert.match(sql,/limit 100/);
  assert.match(route,/\.limit\(500\)/);
  assert.match(route,/\.slice\(0, 12\)/);
  assert.doesNotMatch(route,/\.in\('invoice_external_id'/);
});

test('feedback calibration stays gated until enough human labels exist',()=>{
  assert.match(route,/calibrationMinimum = 20/);
  assert.match(route,/appliesToScoring: false/);
  assert.match(inbox,/Feedback listo para calibrar/);
  assert.match(inbox,/feedback todavía no altera el score automáticamente/);
});
