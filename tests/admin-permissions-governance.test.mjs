import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { loadModuleAccess, responseClient } from './helpers/module-access.mjs';

const pageUrl = new URL('../app/dashboard/admin/permissions/page.tsx', import.meta.url);
const routeUrl = new URL('../app/api/admin/permissions/route.ts', import.meta.url);
const rolesRouteUrl = new URL('../app/api/admin/roles/route.ts', import.meta.url);
const matrixTabUrl = new URL('../components/admin/role-matrix-tab.tsx', import.meta.url);
const accessUrl = new URL('../lib/api/module-access.ts', import.meta.url);

test('individual permissions UI redirects to governed roles and cargos', async () => {
  const page = await readFile(pageUrl, 'utf8');
  assert.match(page, /redirect\('\/dashboard\/admin\/roles'\)/);
});

test('legacy individual permission mutations are closed server-side', async () => {
  const route = await readFile(routeUrl, 'utf8');
  assert.match(route, /LEGACY_INDIVIDUAL_PERMISSIONS_DISABLED/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /grantUserPermission/);
  assert.doesNotMatch(route, /revokeUserPermission/);
});

test('direct role matrix PUT is closed in favor of approval workflow', async () => {
  const route = await readFile(rolesRouteUrl, 'utf8');
  assert.match(route, /DIRECT_ROLE_MATRIX_WRITE_DISABLED/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /\.from\('role_matrix'\)\s*\.upsert/);
});

test('role matrix source errors never render as an empty matrix', async () => {
  const source = await readFile(matrixTabUrl, 'utf8');
  assert.match(source, /if \(!response\.ok\)/);
  assert.match(source, /No fue posible cargar la matriz de roles/);
  assert.match(source, /La falla de la fuente no se interpreta como una matriz vacía/);
  assert.match(source, /\/api\/admin\/role-matrix-changes/);
});

test('effective module access remains cargo role-matrix based', async () => {
  const access = await readFile(accessUrl, 'utf8');
  const { client, calls } = responseClient({ data: { cargo_id: 'cargo-a', cargos: {
    name: 'Reader', role_matrix: [{ module_key: 'fin_compras', access_level: 'LEC' }],
  } }, error: null });
  const kernel = loadModuleAccess(client);
  assert.equal(await kernel.getModuleAccessLevel('user-a', 'worker', 'fin_compras'), 'LEC');
  assert.equal(await kernel.getModuleAccessLevel('user-a', 'worker', 'fin_finanzas'), 'SR');
  assert.ok(calls.every(call => call.table === 'profiles'));
  assert.match(access, /profile\.cargo_id/);
  assert.doesNotMatch(access, /from\('user_permissions'\)/);
});
