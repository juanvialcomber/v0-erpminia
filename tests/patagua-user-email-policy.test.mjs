import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const policy = read('lib/auth/patagua-email-policy.ts');
const users = read('app/api/admin/users/route.ts');
const register = read('app/api/auth/register/route.ts');
test('La Patagua users must have company email, except existing N3uralia admin', () => {
  assert.match(policy, /email\.endsWith\('@lapatagua\.cl'\)/);
  assert.match(policy, /email === 'juan@n3uralia\.com'/);
  assert.match(policy, /email\.startsWith\('demo@'\)/);
  assert.match(users, /if \(!isAuthorizedPataguaEmail\(email\)\)/);
  assert.match(users, /status === 'active' && !isAuthorizedPataguaEmail\(existing\.email\)/);
  assert.match(register, /Registro público deshabilitado/);
});
