import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../app/api/actions/inbox/route.ts', import.meta.url), 'utf8');

test('actions inbox avoids the monolithic frontend view', () => {
  assert.doesNotMatch(source, /\.from\('role_task_frontend_v1'\)/);
  assert.match(source, /\.from\('role_tasks_actionable_v1'\)/);
  assert.match(source, /\.from\('role_task_escalations_v1'\)/);
  assert.match(source, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(source, /\.eq\('cargo_id', profile\.cargo_id\)/);
});

test('scoped inbox reconstructs personal state and action catalog server-side', () => {
  assert.match(source, /\.from\('user_action_states'\)/);
  assert.match(source, /\.eq\('user_id', context\.userId\)/);
  assert.match(source, /\.from\('role_task_action_catalog_v1'\)/);
  assert.match(source, /base\.responsibility === 'owner'/);
  assert.match(source, /visible_now: visibleNow/);
});

test('drilling maintenance routes preserve contextual review and asset IDs', () => {
  assert.match(source, /\.from\('drilling_maintenance_review_queue_v1'\)/);
  assert.match(source, /reviewId=/);
  assert.match(source, /assetId=/);
});

test('timeout fallback remains fail-safe and explicit', () => {
  assert.match(source, /taskError\.code === '57014'/);
  assert.match(source, /degradedReason: 'task_query_timeout'/);
  assert.match(source, /X-Motil-Degraded/);
});

test('successful scoped response identifies its source contract', () => {
  assert.match(source, /source: 'scoped_role_task_queries_v1'/);
});


test('missing coverage never suppresses actionable role tasks', () => {
  assert.match(source, /Always query actionable tasks so newly-routed work cannot disappear until coverage refreshes/);
  assert.doesNotMatch(source, /const actionableLookup = coverageMissing\s*\? Promise\.resolve\(\{ data: \[\], error: null \}\)/);
});
