import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pageUrl = new URL('../app/dashboard/centros-costos/page.tsx', import.meta.url);
const workspaceUrl = new URL('../components/dashboard/cost-centers-workspace.tsx', import.meta.url);

test('cost centers opens on canonical query instead of import tooling', async () => {
  const page = await readFile(pageUrl, 'utf8');
  const workspace = await readFile(workspaceUrl, 'utf8');

  assert.match(page, /CostCentersWorkspace/);
  assert.match(page, /Revisa la lista de centros de costo/);
  assert.match(workspace, /Buscar por código, nombre o descripción/);
  assert.match(workspace, /Estructura de centros de costos/);
  assert.match(workspace, /Administrar lista/);
  assert.match(workspace, /Opciones para actualizar o cargar la lista/);

  const structureIndex = workspace.indexOf('Estructura de centros de costos');
  const adminIndex = workspace.indexOf('Administrar lista');
  assert.ok(structureIndex >= 0 && adminIndex > structureIndex, 'admin tools must remain after the cost-center list');
});

test('cost center admin mutations remain behind existing admin endpoints', async () => {
  const workspace = await readFile(workspaceUrl, 'utf8');
  assert.match(workspace, /\/api\/admin\/seed-cost-centers/);
  assert.match(workspace, /\/api\/admin\/import-cost-centers/);
  assert.doesNotMatch(workspace, /from\('cost_centers'\)/);
});
