import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route = readFileSync('app/api/carpeta-arranque/[id]/review/route.ts', 'utf8');
const list = readFileSync('components/prevention/carpeta-arranque-list.tsx', 'utf8');
const page = readFileSync('app/dashboard/sostenibilidad/prevencion-riesgos/carpeta-arranque/page.tsx', 'utf8');
test('L1 may review a single uploaded document before a folder is submitted', () => {
  assert.match(route, /\['en_revision_l1', 'pendiente'\]\.includes\(carpeta\.status\)/);
  assert.match(route, /carpeta\.status === 'en_revision_l1' && allL1Done/);
  assert.match(route, /!validSlots\.get\(r\.slot_index\)\?\.file_name/);
});
test('individual review action and document queue are present', () => {
  assert.match(list, /slotIndex=\{reviewing\.slotIndex\}/);
  assert.match(list, /Revisar documento/);
  assert.match(list, /c\.status === 'pendiente' && c\.carpeta_documentos\.some/);
  assert.match(page, /Documentos por revisar/);
});

test('review timestamps remain executable, not commented out by escaped newlines', () => {
  assert.match(route, /^  const now = new Date\(\)\.toISOString\(\);$/m);
  assert.doesNotMatch(route, /\/\/[^\n]*\\n\s*const now/);
});
