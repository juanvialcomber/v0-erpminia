import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const dashboardUrl = new URL('../components/dashboard/produccion-dashboard.tsx', import.meta.url);
const routeUrl = new URL('../app/api/produccion/canonical-overview/route.ts', import.meta.url);

test('production summary puts accredited metallurgy before source coverage', async () => {
  const dashboard = await readFile(dashboardUrl, 'utf8');

  const currentIndex = dashboard.indexOf('aria-label="Serie metalúrgica acreditada"');
  const coverageIndex = dashboard.indexOf('<CoverageOverview data={data}/>');
  assert.ok(currentIndex >= 0, 'accredited metallurgy section must exist');
  assert.ok(coverageIndex > currentIndex, 'source coverage must follow accredited metallurgy');

  assert.match(dashboard, /Histórico confirmado/);
  assert.match(dashboard, /Metalurgia ·/);
  assert.match(dashboard, /Qué requiere atención/);
  assert.match(dashboard, /Datos disponibles/);
  assert.match(dashboard, /Muestra qué datos existen/);
  assert.doesNotMatch(dashboard, /Cobertura real por área/);
  assert.doesNotMatch(dashboard, /Trabajo pendiente sobre datos/);
  assert.doesNotMatch(dashboard, /min-h-52/);
});

test('production source review remains compact and does not fabricate a combined backlog', async () => {
  const dashboard = await readFile(dashboardUrl, 'utf8');

  assert.match(dashboard, /Datos por revisar/);
  assert.match(dashboard, /Un mismo dato puede aparecer en más de una revisión/);
  assert.match(dashboard, /Control de datos/);
  assert.match(dashboard, /Sin datos/);
  assert.match(dashboard, /Si falta una fuente, no mostramos cero/i);
});

test('canonical overview remains tenant scoped and read only for the summary composition', async () => {
  const route = await readFile(routeUrl, 'utf8');

  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.PROD_OPERACIONES\)/);
  assert.match(route, /getOrganizationContext/);
  assert.match(route, /Ausencia de una fuente no equivale a valor cero/);
  assert.doesNotMatch(route, /export async function (POST|PATCH|PUT|DELETE)/);
});
