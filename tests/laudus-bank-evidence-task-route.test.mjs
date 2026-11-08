import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const inboxPath = new URL('../app/api/actions/inbox/route.ts', import.meta.url);
const pagePath = new URL('../app/dashboard/finanzas/documentos/importar/page.tsx', import.meta.url);

test('bank evidence task routes to finance document intake', async () => {
  const source = await readFile(inboxPath, 'utf8');
  assert.match(source, /task\.task_key === 'laudus-bank-evidence-gap'/);
  assert.match(source, /\/dashboard\/finanzas\/documentos\/importar\?source=bank-evidence/);
});

test('finance document intake explains bank evidence semantics without auto reconciliation', async () => {
  const page = await readFile(pagePath, 'utf8');
  assert.match(page, /bank-evidence/);
  assert.match(page, /Evidencia bancaria requerida/);
  assert.match(page, /no marca pagos como conciliados ni modifica Laudus automáticamente/);
  assert.match(page, /DocumentUpload module="finanzas" category="documentos"/);
  assert.match(page, /Cartola bancaria/);
});


test('finance document catalog includes bank statements as an explicit type', async () => {
  const upload = await readFile(new URL('../components/documents/document-upload.tsx', import.meta.url), 'utf8');
  assert.match(upload, /finanzas:\s*\[[\s\S]*'Cartola bancaria'/);
});
