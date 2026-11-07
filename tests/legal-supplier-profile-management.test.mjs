import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const helper = await readFile(new URL('../lib/api/eecc-profile-access.ts', import.meta.url), 'utf8');
const collection = await readFile(new URL('../app/api/eecc/route.ts', import.meta.url), 'utf8');
const item = await readFile(new URL('../app/api/eecc/[id]/route.ts', import.meta.url), 'utf8');
const importRoute = await readFile(new URL('../app/api/eecc/import/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/documentos-gestion/eecc/page.tsx', import.meta.url), 'utf8');
const legal = await readFile(new URL('../app/dashboard/legal/contratistas-documentos/page.tsx', import.meta.url), 'utf8');

test('supplier profile writes are explicitly scoped to approved managers', () => {
  assert.match(helper, /MODULE_KEYS\.LEGAL_EECC/);
  assert.match(helper, /MODULE_KEYS\.CONTRATOS_VISUALIZACION/);
  assert.match(helper, /ariellopez@lapatagua\.cl/);
  assert.match(helper, /legalAccess === 'ED'/);
  assert.match(collection, /requireEeccProfileManager/);
  assert.match(item, /requireEeccProfileManager/);
  assert.match(importRoute, /requireEeccProfileManager/);
  assert.match(importRoute, /const organizationId = auth\.organizationId/);
});

test('supplier profile deletion remains more restrictive than create or edit', () => {
  assert.match(helper, /canDelete: contractsAccess === 'ED'/);
  assert.match(item, /if \(!manager\.canDelete\)/);
  assert.match(item, /Eliminar perfiles requiere permiso contractual de edición/);
  assert.match(page, /const canDelete = isAdmin \|\| canEdit\('contratos_visualizacion'\)/);
});

test('Legal exposes supplier profile management without restoring a standalone assistant', () => {
  assert.match(legal, /Gestionar proveedores/);
  assert.match(legal, /\/dashboard\/documentos-gestion\/eecc/);
});
