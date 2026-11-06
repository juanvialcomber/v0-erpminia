import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page=readFileSync('app/dashboard/legal/documentos/page.tsx','utf8');
const api=readFileSync('app/api/legal/documentos/route.ts','utf8');
const review=readFileSync('app/api/legal/documentos/review/route.ts','utf8');
const preview=readFileSync('app/api/legal/documentos/[id]/preview/route.ts','utf8');
const download=readFileSync('app/api/legal/documentos/download/route.ts','utf8');

test('Elias legal documents use ChileFlota executive inbox pattern',()=>{
  assert.match(page,/Bandeja documental/);
  assert.match(page,/Pendiente/);
  assert.match(page,/Aprobado/);
  assert.match(page,/Rechazado/);
  assert.match(page,/Vista previa/);
  assert.match(page,/Aprobar/);
  assert.match(page,/Rechazar/);
});

test('legal document list and decisions are organization scoped',()=>{
  assert.match(api,/eq\('organization_id', access\.organizationId\)/);
  assert.match(review,/requireModuleAccess\(request, MODULE_KEYS\.LEGAL_MODULO, true\)/);
  assert.match(review,/eq\('organization_id', access\.organizationId\)/);
  assert.match(download,/eq\('organization_id', access\.organizationId\)/);
});

test('DOCX preview is internal and dependency-free',()=>{
  assert.match(preview,/extractZipEntry/);
  assert.match(preview,/word\/document\.xml/);
  assert.match(preview,/inflateRawSync/);
  assert.doesNotMatch(preview,/officeapps|google\.com\/gview/i);
});

test('rejection requires an observation and approval is direct for Legal editor',()=>{
  assert.match(review,/Debes ingresar una observación para rechazar/);
  assert.match(review,/status: 'active'/);
  assert.match(review,/status: 'rejected'/);
});
