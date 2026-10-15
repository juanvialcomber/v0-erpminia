import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../components/dashboard/maintenance-home.tsx', import.meta.url), 'utf8');
const terrain = await readFile(new URL('../components/maintenance/mobile-terrain-panel.tsx', import.meta.url), 'utf8');
const myWork = await readFile(new URL('../app/api/maintenance/my-work/route.ts', import.meta.url), 'utf8');

test('execution users receive the dedicated assigned-work surface on every viewport', () => {
  assert.match(dashboard, /if \(mode === 'execution'\) \{/);
  assert.match(dashboard, /<MobileTerrainPanel \/>/);
  assert.match(dashboard, /max-w-xl/);
  assert.doesNotMatch(dashboard, /md:hidden"><MobileTerrainPanel/);
  assert.doesNotMatch(dashboard, /mode==='execution' \? 'hidden md:block' : undefined/);
});

test('terrain lists all assigned orders including future tasks and does not expose global maintenance queues', () => {
  assert.match(terrain, /\/api\/maintenance\/my-work/);
  assert.doesNotMatch(terrain, /\/api\/maintenance\/control-center/);
  assert.match(terrain, /Mis órdenes de trabajo/);
  assert.match(terrain, /actions\.map\(\(action\) =>/);
  assert.match(terrain, /prioridad es una recomendación/);
  assert.match(terrain, /OT crítica asignada/);
  assert.match(terrain, /refreshInterval: 30_000/);
  assert.match(terrain, /toast\.warning/);
  assert.match(terrain, /Perfil aún no vinculado/);
  assert.match(terrain, /No tienes OT activas asignadas/);
  assert.match(terrain, /incluidas las futuras/);
  assert.doesNotMatch(terrain, /actions\?\.\[0\]/);
  assert.doesNotMatch(terrain, /mobile-quick-complete/);
  assert.doesNotMatch(terrain, /MARCAR COMPLETADO/);
});

test('my-work API requires canonical person linkage and scopes work orders to that assignee and organization', () => {
  assert.match(myWork, /resolveMaintenanceViewerMode\(cargoName\) !== 'execution'/);
  assert.match(myWork, /\.from\('people'\)/);
  assert.match(myWork, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(myWork, /\.eq\('profile_id', access\.user\.id\)/);
  assert.match(myWork, /identityLinked: false/);
  assert.match(myWork, /\.from\('maintenance_work_orders'\)/);
  assert.match(myWork, /\.eq\('assigned_person_id', person\.id\)/);
  assert.match(myWork, /buildAssignedWorkActions/);
  assert.match(myWork, /\.in\('status', \['open', 'assigned', 'pending', 'planned', 'in_progress'\]\)/);
});
