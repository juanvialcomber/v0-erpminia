import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const access = await readFile(new URL('../lib/api/module-access.ts', import.meta.url), 'utf8');

test('module permission resolves profile -> cargo -> role matrix in one database request', () => {
  const body = access.slice(access.indexOf('export async function getUserModuleAccess'), access.indexOf('export async function getModuleAccessLevel'));
  assert.match(body, /\.from\('profiles'\)/);
  assert.match(body, /cargos!profiles_cargo_id_fkey\(name,role_matrix!role_matrix_cargo_id_fkey\(module_key,access_level\)\)/);
  assert.doesNotMatch(body, /\.from\('role_matrix'\)|\.from\('cargos'\)/);
});

test('permission resolution fails closed, requires actual cargo, and does not cache across requests', () => {
  assert.match(access, /if \(error \|\| !profile\?\.cargo_id \|\| !profile\.cargos\)/);
  assert.match(access, /return \{ hasCargo: false, cargoId: null, cargoName: null, access: \{\} \}/);
  assert.match(access, /row\.access_level === 'ED' \|\| row\.access_level === 'LEC' \|\| row\.access_level === 'SR'/);
  assert.doesNotMatch(access, /unstable_cache|cacheLife|setInterval|Map<string, UserModuleAccess>/);
});

test('server access still requires signed authentication and returns 403 on missing permission', () => {
  assert.match(access, /resolveAuthContext\(request\)/);
  assert.match(access, /if \(!authContext\?\.user\)/);
  assert.match(access, /access\[moduleKey\] \?\? 'SR'/);
  assert.match(access, /status: 403/);
});
