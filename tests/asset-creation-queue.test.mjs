import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261027124500_asset_creation_requests.sql', import.meta.url),
  'utf8',
);
const route = readFileSync(
  new URL('../app/api/finance/asset-creation-requests/route.ts', import.meta.url),
  'utf8',
);

test('asset creation queue is non-canonical, tenant scoped and RLS protected', () => {
  assert.match(migration, /organization_id uuid not null/);
  assert.match(migration, /reconciliation_review_id uuid not null/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.asset_creation_requests from public,anon,authenticated/);
  assert.match(migration, /canonical_mutated',false/);
});

test('accepted candidates enter the queue without inventing an asset code', () => {
  assert.match(migration, /r\.status='accepted'/);
  assert.match(migration, /'awaiting_code'/);
  assert.match(migration, /proposed_asset_code text/);
  assert.doesNotMatch(migration, /insert into canonical\.assets/i);
});

test('asset code assignment is finance scoped and rejects canonical collisions', () => {
  assert.match(route, /FIN_FINANZAS/);
  assert.match(route, /\.schema\('canonical'\)/);
  assert.match(route, /\.eq\('asset_code', assetCode\)/);
  assert.match(route, /ready_to_create/);
  assert.match(route, /23505/);
  assert.doesNotMatch(route, /\.from\('assets'\)\.insert/);
});
