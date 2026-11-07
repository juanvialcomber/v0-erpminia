import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/legal/contract-evidence-queue/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/avances-pagos/page.tsx', import.meta.url), 'utf8');

test('incoming contract evidence reuses canonical email and WhatsApp sources', () => {
  assert.match(api, /motil_email_source_manifest/);
  assert.match(api, /motil_whatsapp_groups/);
  assert.match(api, /motil_whatsapp_messages/);
  assert.match(api, /motil_whatsapp_attachments/);
  assert.match(api, /\.eq\('organization_id', context\.organizationId\)/);
});

test('incoming evidence matching is deterministic and review-only', () => {
  assert.match(api, /CONTRACT_HINT_RE/);
  assert.match(api, /purchase_orders/);
  assert.match(api, /needs_review: true/);
  assert.match(api, /Nunca actualiza avance, pago o contrato automáticamente/);
  assert.doesNotMatch(api, /\.from\('contracts'\)\.update|\.from\('contract_progress_updates'\)\.insert/);
});

test('contract payment UI exposes evidence without creating another workspace', () => {
  assert.match(page, /Evidencia entrante/);
  assert.match(page, /Correo \+ WhatsApp/);
  assert.match(page, /Sin match explícito/);
  assert.match(page, /MOTIL sólo identifica referencias explícitas de contrato u OC/);
});
