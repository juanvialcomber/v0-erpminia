import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const fieldApiUrl = new URL('../app/api/field/work-orders/route.ts', import.meta.url);
const fieldPageUrl = new URL('../app/dashboard/terreno/page.tsx', import.meta.url);
const legacyApiUrl = new URL('../app/api/mantenimiento/ordenes/route.ts', import.meta.url);

test('legacy field surface cannot start an OT outside the canonical lifecycle', async () => {
  const [api, page] = await Promise.all([
    readFile(fieldApiUrl, 'utf8'),
    readFile(fieldPageUrl, 'utf8'),
  ]);

  assert.match(api, /Inicia la OT desde su flujo canónico/);
  assert.match(api, /status: 409/);
  assert.doesNotMatch(api, /update\(\{ status: 'in_progress', start_date:/);
  assert.match(page, /Iniciar desde la OT/);
  assert.doesNotMatch(page, /action\(\{ action: 'start' \}/);
});

test('legacy mantenimiento_ordenes endpoint cannot create a second OT truth', async () => {
  const route = await readFile(legacyApiUrl, 'utf8');

  assert.match(route, /endpoint legacy es de solo lectura/);
  assert.match(route, /maintenance_work_orders/);
  assert.match(route, /status: 410/);
  assert.doesNotMatch(route, /\.from\('mantenimiento_ordenes'\)[\s\S]*\.insert\(/);
});
