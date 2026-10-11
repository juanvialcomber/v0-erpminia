import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const proxy = await readFile(new URL('../proxy.ts', import.meta.url), 'utf8');
const loginRoute = await readFile(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8');
const authLoginPage = await readFile(new URL('../app/auth/login/page.tsx', import.meta.url), 'utf8');
const loginPage = await readFile(new URL('../components/auth/login-page.tsx', import.meta.url), 'utf8');
const dict = await readFile(new URL('../lib/i18n/dictionaries.ts', import.meta.url), 'utf8');

test('public login bypasses stale custom-session cleanup before auth verification', () => {
  const publicGuard = proxy.indexOf("pathname.startsWith('/api/') && isPublicApiRoute(pathname)");
  const authLookup = proxy.indexOf('await supabase.auth.getUser()');
  const tokenLookup = proxy.indexOf("request.cookies.get('auth_token')");

  assert.ok(publicGuard >= 0, 'expected early public API guard');
  assert.ok(authLookup > publicGuard, 'Supabase auth lookup must happen after public login bypass');
  assert.ok(tokenLookup > publicGuard, 'custom token validation must happen after public login bypass');
  assert.match(proxy, /PUBLIC_API_ROUTES = new Set\(\[\s*'\/api\/health',[\s\S]*'\/api\/auth\/login'/);
});

test('custom-session cleanup removes stale role context as well as the auth token', () => {
  assert.match(proxy, /\['auth_token', 'user_role', 'user_email', 'user_cargo'\]/);
});

test('successful login response is non-cacheable and clears stale cargo when absent', () => {
  assert.match(loginRoute, /response\.headers\.set\('Cache-Control', 'no-store'\)/);
  assert.match(loginRoute, /else \{\s*response\.cookies\.set\('user_cargo', '', \{[\s\S]*maxAge: 0/);
});

test('auth login page is always rendered from the current deployment', () => {
  assert.match(authLoginPage, /export const dynamic = 'force-dynamic'/);
  assert.match(authLoginPage, /export const revalidate = 0/);
});

test('stale legacy hashes can recover only through the linked Supabase Auth identity', () => {
  const legacyCheck = loginRoute.indexOf('bcrypt.compare(password, profile.password_hash)');
  const authFallback = loginRoute.indexOf('auth.signInWithPassword({ email, password })');
  const identityLookup = loginRoute.indexOf(".from('auth_profile_identity_links')");
  const exactProfileCheck = loginRoute.indexOf('confirmedLink?.profile_id === profile.id');

  assert.ok(legacyCheck >= 0, 'expected legacy bcrypt verification');
  assert.ok(authFallback > legacyCheck, 'Supabase Auth should be a recovery path after legacy verification fails');
  assert.ok(identityLookup > authFallback, 'recovered Auth identity must be resolved through the canonical link');
  assert.ok(exactProfileCheck > identityLookup, 'recovered identity must match the exact canonical profile');
  assert.match(loginRoute, /NEXT_PUBLIC_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(loginRoute, /encrypted_password/);
});

test('inactive profiles cannot receive a new session or retain an existing one', async () => {
  const authSession = await readFile(new URL('../lib/api/auth-session.ts', import.meta.url), 'utf8');

  assert.match(loginRoute, /cargo_id, status/);
  assert.match(loginRoute, /!profile \|\| profile\.status !== 'active'/);
  assert.match(authSession, /full_name, first_name, last_name, status/);
  assert.match(authSession, /if \(!profile\) \{\s*return \{ authUserId, active: false \};\s*\}/);
  assert.match(authSession, /if \(profile\.status !== 'active'\)/);
  assert.match(authSession, /identity\.active !== true \|\| !identity\.applicationUserId/);
  assert.match(proxy, /isActiveCustomSessionProfile/);
  assert.match(proxy, /customSession && !\(await isActiveCustomSessionProfile\(customSession\.user\.id\)\)/);
});

test('login confirms the authenticated session before redirecting', () => {
  const loginRequest = loginPage.indexOf("fetch('/api/auth/login'");
  const sessionCheck = loginPage.indexOf("fetch('/api/me/access'");
  const redirect = loginPage.indexOf('window.location.replace(getSafeRedirect())');

  assert.ok(loginRequest >= 0, 'expected login request');
  assert.ok(sessionCheck > loginRequest, 'session check must follow accepted credentials');
  assert.ok(redirect > sessionCheck, 'redirect must happen only after session verification');
  assert.match(dict, /Las credenciales fueron aceptadas, pero la sesión no pudo establecerse/);
});
