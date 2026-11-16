import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/ingenieria/proyectos/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/ingenieria/proyectos/page.tsx', import.meta.url), 'utf8');
const topography = await readFile(new URL('../app/dashboard/produccion/topografia/page.tsx', import.meta.url), 'utf8');

test('Engineering intake is protected by server-side role and organization context', () => {
  assert.match(route, /getOrganizationContext\(request\)/);
  assert.match(route, /ENGINEERING_CARGO = 'JEFE INGENIERIA Y PROYECTOS'/);
  assert.match(route, /getModuleAccessLevel\(context\.userId, context\.role, MODULE_KEYS\.PROD_TOPOGRAFIA\)/);
  assert.match(route, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(route, /private, no-store/);
});

test('Intake persists drafts but does not expose approval or deletion operations', () => {
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /export async function PATCH/);
  assert.doesNotMatch(route, /export async function (PUT|DELETE)/);
  assert.match(route, /from\('engineering_project_intake_v1'\)/);
  assert.match(route, /status: 'draft'/);
  assert.match(route, /\.eq\('status', 'draft'\)/);
  assert.match(route, /approvalsEnabled: false/);
  assert.doesNotMatch(route, /\.upsert\(|\.delete\(|\.rpc\(/);
});

test('UI provides the intake fields, draft list, and recoverable loading/error states', () => {
  assert.match(page, /Iniciar ficha de proyecto/);
  assert.match(page, /Nombre del proyecto/);
  assert.match(page, /Área solicitante/);
  assert.match(page, /Necesidad o problema/);
  assert.match(page, /Guardar borrador/);
  assert.match(page, /Fichas guardadas/);
  assert.match(page, /Continuar/);
  assert.match(page, /Borrador/);
  assert.match(page, /isLoading/);
  assert.match(page, /error/);
  assert.match(page, /Reintentar/);
  assert.match(page, /no aprueba alcance, presupuesto ni programa/);
});

test('Topography retains its dashboard and links to engineering projects', () => {
  assert.match(topography, /TopografiaDashboard/);
  assert.match(topography, /\/dashboard\/ingenieria\/proyectos/);
});
