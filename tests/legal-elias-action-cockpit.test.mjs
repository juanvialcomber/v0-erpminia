import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/dashboard/legal/page.tsx', import.meta.url), 'utf8');
const inbox = await readFile(new URL('../app/dashboard/legal/inbox/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/legal/inbox/route.ts', import.meta.url), 'utf8');
const layout = await readFile(new URL('../app/dashboard/legal/layout.tsx', import.meta.url), 'utf8');

test('Elias home is an action cockpit with at most three priorities', () => {
  assert.match(home, /Máximo tres asuntos/);
  assert.match(home, /inboxData\.data\.slice\(0,3\)/);
  assert.match(home, /Siguiente acción:/);
  assert.doesNotMatch(home, /Trabajo principal de Legal/);
});

test('Elias home shows exceptions instead of repeating module cards', () => {
  assert.match(home, /Excepciones operativas/);
  assert.match(home, /requieren atención/);
  assert.match(home, /confirmaciones nuevas/);
  assert.doesNotMatch(home, /Cumplimiento mensual, documentos y subsanaciones/);
});

test('pending work is ranked by operational urgency, not date alone', () => {
  assert.match(api, /actionScore/);
  assert.match(api, /item\.overdue/);
  assert.match(api, /item\.management_ready/);
  assert.match(api, /item\.evidence_status === 'pending'/);
  assert.match(api, /item\.days_until/);
});

test('Legal navigation does not duplicate the pending-work surface', () => {
  assert.doesNotMatch(layout, /href: '\/dashboard\/legal\/inbox', label: 'Pendientes'/);
  assert.match(layout, /label: 'Hoy'/);
  assert.match(inbox, /Trabajo ordenado por urgencia, evidencia y siguiente acción/);
});
