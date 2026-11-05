import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const apiUrl = new URL('../app/api/documents/intake/route.ts', import.meta.url);
const pageUrl = new URL('../app/dashboard/documentos-gestion/ingesta/page.tsx', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/20261105124000_document_intake.sql', import.meta.url);

test('document intake remains private and backend-controlled', async () => {
  const api = await readFile(apiUrl, 'utf8');
  const migration = await readFile(migrationUrl, 'utf8');

  assert.match(api, /const BUCKET = 'document-intake'/);
  assert.match(api, /resolveAuthContext\(request\)/);
  assert.match(api, /createSignedUploadUrl\(path\)/);
  assert.match(api, /path\.startsWith\('00_inbox\/'\)/);
  assert.match(migration, /values \('document-intake', 'document-intake', false\)/);
  assert.match(migration, /alter table public\.document_intake_items enable row level security/);
  assert.doesNotMatch(migration, /create policy/i);
});

test('document intake is tenant scoped and deduplicates by sha256 before upload', async () => {
  const api = await readFile(apiUrl, 'utf8');

  assert.match(api, /\.eq\('organization_id', auth\.organizationId\)/);
  assert.match(api, /\.eq\('sha256', sha256\)/);
  assert.match(api, /status: 'pending_classification'/);
  assert.match(api, /uploaded_by: auth\.user\.id/);
  assert.match(api, /MAX_FILE_SIZE = 50 \* 1024 \* 1024/);
});

test('document intake UI hashes files and uses signed uploads rather than public bucket access', async () => {
  const page = await readFile(pageUrl, 'utf8');

  assert.match(page, /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(page, /uploadToSignedUrl\(prepared\.path, prepared\.token, item\.file/);
  assert.match(page, /Arrastra documentos aquí/);
  assert.match(page, /Windows Server/);
  assert.match(page, /Laudus/);
  assert.doesNotMatch(page, /getPublicUrl/);
});
