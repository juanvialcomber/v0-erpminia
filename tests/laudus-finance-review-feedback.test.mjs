import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261024150000_laudus_finance_review_feedback.sql', import.meta.url),
  'utf8',
);

test('Laudus finance feedback is private learning evidence', () => {
  assert.match(migration, /integration\.laudus_finance_review_feedback/);
  assert.match(migration, /decision in \('accepted','rejected','deferred'\)/);
  assert.match(migration, /actor_user_id uuid not null/);
  assert.match(migration, /created_at timestamptz not null default now\(\)/);
  assert.match(migration, /revoke all .*from public, anon, authenticated/s);
  assert.match(migration, /grant select, insert .*to service_role/s);
});

test('finance feedback migration cannot mutate canonical finance', () => {
  assert.doesNotMatch(migration, /update\s+public\.procurement_/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.procurement_/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.procurement_/i);
  assert.doesNotMatch(migration, /update\s+public\.suppliers/i);
});
