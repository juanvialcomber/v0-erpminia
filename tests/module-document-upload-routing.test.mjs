import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const uploadComponentUrl = new URL('../components/documents/document-upload.tsx', import.meta.url);
const uploadRouteUrl = new URL('../app/api/documents/upload/route.ts', import.meta.url);

test('all module document uploads use the canonical module-documents endpoint', async () => {
  const component = await readFile(uploadComponentUrl, 'utf8');
  assert.match(component, /fetch\('\/api\/documents\/upload'/);
  assert.doesNotMatch(component, /\/api\/sostenibilidad\/upload-documento/);
  assert.doesNotMatch(component, /isLegalModule/);
});

test('canonical upload preserves source module category and uploader', async () => {
  const route = await readFile(uploadRouteUrl, 'utf8');
  assert.match(route, /formData\.get\('module'\)/);
  assert.match(route, /formData\.get\('category'\)/);
  assert.match(route, /module,/);
  assert.match(route, /category,/);
  assert.match(route, /uploaded_by: auth\.user\.id/);
  assert.match(route, /from\('module_documents'\)/);
});


test('canonical upload and reads are organization scoped and preserve provenance', async () => {
  const uploadRoute = await readFile(uploadRouteUrl, 'utf8');
  const listRoute = await readFile(new URL('../app/api/documents/list/route.ts', import.meta.url), 'utf8');
  const listComponent = await readFile(new URL('../components/documents/document-list.tsx', import.meta.url), 'utf8');

  assert.match(uploadRoute, /organization_id: auth\.organizationId/);
  assert.match(uploadRoute, /provenance_status: 'operational'/);
  assert.match(uploadRoute, /\.eq\('organization_id', auth\.organizationId\)/);
  assert.match(listRoute, /const organizationId = auth\.organizationId/);
  assert.match(listRoute, /\.eq\('organization_id', organizationId\)/);
  assert.match(listComponent, /Fuente canónica/);
});
