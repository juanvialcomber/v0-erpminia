import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const sidebar = await readFile(new URL('../components/layout/sidebar.tsx', import.meta.url), 'utf8');
const home = await readFile(new URL('../components/dashboard/dashboard-home.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/intelligence/engineering-assistant/route.ts', import.meta.url), 'utf8');
const auth = await readFile(new URL('../app/api/auth/login/route.ts', import.meta.url), 'utf8');

test('projects navigation requires canonical module-access cargo and read capability', () => {
  assert.match(sidebar, /cargoName!=='JEFE INGENIERIA Y PROYECTOS'/);
  assert.match(sidebar, /moduleKey: 'prod_topografia'/);
  assert.match(sidebar, /href: '\/dashboard\/ingenieria\/proyectos'/);
  assert.match(sidebar, /canView\(item.moduleKey\)/);
  assert.match(sidebar, /Ingeniería y Proyectos/);
});
test('projects leadership home does not claim mine planning as its identity', () => {
  assert.match(home, /isProjectsRole \? 'Ingeniería y Proyectos' : 'Planificación minera'/);
  assert.match(home, /inventario y las aprobaciones todavía requieren validación/);
});
test('verified Supabase password login requires exact profile identity before session', () => {
  assert.match(auth, /auth\.signInWithPassword\(\{ email, password \}\)/);
  assert.match(auth, /identityLink\.profile_id === profile\.id/);
  assert.match(auth, /authData\.user\.email_confirmed_at/);
  assert.match(auth, /signCustomSession/);
});
test('engineering assistant preserves read-only restrictions for projects leadership', () => {
  assert.match(api, /ENGINEERING_CARGOS\.has\(cargo\.name\)/);
  assert.match(api, /getModuleAccessLevel\(context\.userId, context\.role, MODULE_KEYS\.PROD_TOPOGRAFIA\)/);
  assert.match(api, /operationalMutationExecuted: false/);
  assert.doesNotMatch(api, /\.(insert|update|upsert|delete|rpc)\(/);
});
