import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiUrl = new URL('../app/api/maintenance/sources/route.ts', import.meta.url);
const pageUrl = new URL('../app/dashboard/mantenimiento/fuentes/page.tsx', import.meta.url);
const layoutUrl = new URL('../app/dashboard/mantenimiento/layout.tsx', import.meta.url);

test('maintenance source registry is organization scoped and permission guarded', async () => {
  const source = await readFile(apiUrl, 'utf8');
  assert.match(source, /MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(source, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(source, /planning_maintenance_source_imports/);
  assert.match(source, /planning_maintenance_source_rows/);
});

test('maintenance source registry preserves provenance and review-required state', async () => {
  const source = await readFile(pageUrl, 'utf8');
  assert.match(source, /TechnicalGuidelineLibrary/);
  assert.match(source, /\/dashboard\/planificacion\/datos/);
  assert.match(source, /Revisión requerida/);
  assert.match(source, /sólo convierte coincidencias verificables en datos canónicos/);
  assert.doesNotMatch(source, /MOTIL conserva el original/);
});

test('maintenance exposes source provenance to planning and leadership users', async () => {
  const source = await readFile(layoutUrl, 'utf8');
  assert.match(source, /\/dashboard\/mantenimiento\/fuentes/);
  assert.match(source, /label: 'Fuentes'/);
  assert.match(source, /planning:[\s\S]*'Fuentes'/);
  assert.match(source, /leadership:[\s\S]*'Fuentes'/);
});
