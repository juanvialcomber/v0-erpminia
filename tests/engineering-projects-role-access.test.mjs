import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile(new URL('../app/api/intelligence/engineering-assistant/route.ts', import.meta.url),'utf8');
const home = await readFile(new URL('../components/dashboard/dashboard-home.tsx', import.meta.url),'utf8');
const widget = await readFile(new URL('../components/intelligence/senior-assistant-widget.tsx', import.meta.url),'utf8');

test('existing mine planning cargo and new engineering-projects cargo are both accepted without wildcard or admin bypass', () => {
  assert.match(api, /new Set\(\['JEFE ING\. PLA MINA', 'JEFE INGENIERIA Y PROYECTOS'\]\)/);
  assert.match(api, /ENGINEERING_CARGOS\.has\(cargo\.name\)/);
  assert.match(api, /getModuleAccessLevel\(context\.userId, context\.role, MODULE_KEYS\.PROD_TOPOGRAFIA\)/);
  assert.match(api, /access !== 'ED' && access !== 'LEC'/);
  assert.match(api, /\.eq\('organization_id', context\.organizationId\)/);
  assert.doesNotMatch(api, /\.from\('profiles'\)[\s\S]*?\.select\('cargo_id'\)[\s\S]*?\.maybeSingle\(\)[\s\S]*?\.or\(/);
});

test('engineering projects requests do not imply verified project, financial or execution facts', () => {
  assert.match(api, /NO hay cartera de proyectos de Ingeniería validada/);
  assert.match(api, /No deduzcas proyectos, presupuestos, estados de pago ni avance/);
  assert.match(api, /operationalMutationExecuted: false/);
  assert.doesNotMatch(api, /\.(insert|upsert|update|delete|rpc)\(/);
});

test('engineering projects cargo resolves to its own honest home and navigation', () => {
  assert.match(home, /jefe ingenieria y proyectos/);
  assert.match(home, /isProjectsRole \? 'Ingeniería y Proyectos' : 'Planificación minera'/);
  assert.match(home, /href: '\/dashboard\/ingenieria\/proyectos'/);
  assert.match(widget, /isProjectEngineer/);
  assert.match(widget, /pathname\.startsWith\('\/dashboard\/ingenieria\/proyectos'\)/);
  assert.match(widget, /Asistente de Ingeniería y Proyectos/);
  assert.match(widget, /\/api\/intelligence\/engineering-assistant/);
});
