import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/ingenieria/proyectos/route.ts',import.meta.url),'utf8');
const page = await readFile(new URL('../app/dashboard/ingenieria/proyectos/page.tsx',import.meta.url),'utf8');
const topography = await readFile(new URL('../app/dashboard/produccion/topografia/page.tsx',import.meta.url),'utf8');

test('Engineering portfolio is protected by server-side module authorization and organization context', () => {
  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.PROD_TOPOGRAFIA\)/);
  assert.match(route, /if \(!access\.authorized\) return access\.response/);
  assert.match(route, /getOrganizationContext\(request\)/);
  assert.match(route, /if \(!context\.ok\) return context\.response/);
  assert.match(route, /private, no-store/);
});

test('Discovery does not mutate production records or invent project facts', () => {
  assert.match(route, /awaiting_canonical_intake/);
  assert.match(route, /workflow_not_approved/);
  assert.match(route, /total: null/);
  assert.match(route, /readOnly: true/);
  assert.match(route, /approvalsEnabled: false/);
  assert.doesNotMatch(route, /export async function (POST|PATCH|PUT|DELETE)/);
  assert.doesNotMatch(route, /\.(insert|update|upsert|delete|rpc)\(/);
});

test('UI explicitly distinguishes unknown projects from zero and protects empty/error states', () => {
  assert.match(page, /Sin inventario validado/);
  assert.match(page, /No equivale a cero proyectos/);
  assert.match(page, /Circuito por definir/);
  assert.match(page, /isLoading/);
  assert.match(page, /error/);
  assert.match(page, /Reintentar/);
  assert.match(page, /Esta versión es solo lectura/);
});

test('Topography retains its existing dashboard and links to the engineering portfolio', () => {
  assert.match(topography, /TopografiaDashboard/);
  assert.match(topography, /\/dashboard\/ingenieria\/proyectos/);
});
