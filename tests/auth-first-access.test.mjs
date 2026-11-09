import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/auth/first-access/route.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261109153000_profile_first_access_tokens.sql','utf8');

test('first access stores only token digests and is one-time', () => {
  assert.match(route, /createHash\('sha256'\)/);
  assert.match(route, /\.is\('used_at', null\)/);
  assert.match(route, /expires_at <= now/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /used_at timestamptz/);
});

test('first access creates official Supabase Auth identity and canonical bridge', () => {
  assert.match(route, /auth\.admin\.createUser/);
  assert.match(route, /email_confirm: true/);
  assert.match(route, /auth_profile_identity_links/);
  assert.match(route, /first_access_setup/);
  assert.match(route, /bcrypt\.hash\(password, 12\)/);
});

test('first access tokens are not browser-readable through Data API', () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.profile_first_access_tokens from anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.profile_first_access_tokens to service_role/);
});
