import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('verified Supabase identities bridge only after successful password authentication', async () => {
  const login = await readFile(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8');
  assert.match(login, /signInWithPassword/);
  assert.match(login, /authData\.user\.email_confirmed_at/);
  assert.match(login, /authData\.user\.email\?\.trim\(\)\.toLowerCase\(\) === email/);
  assert.match(login, /\.eq\('profile_id', profile\.id\)\.maybeSingle\(\)/);
  assert.match(login, /verified_email_new_user_bridge/);
  assert.match(login, /confirmedLink\?\.profile_id === profile\.id/);
  assert.doesNotMatch(login, /auth_profile_identity_links'\)\.upsert/);
});
