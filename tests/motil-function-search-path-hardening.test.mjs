import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20261123170000_pin_pure_function_search_paths.sql',
  import.meta.url,
);
const storageMigrationUrl = new URL(
  '../supabase/migrations/20261123173000_lock_private_storage_to_signed_or_server_access.sql',
  import.meta.url,
);
const blobUploadRouteUrl = new URL(
  '../app/api/compras/import-existencias/upload/route.ts',
  import.meta.url,
);

test('pure MOTIL SQL helpers resolve built-ins from a fixed safe schema', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /alter function public\.motil_media_visual_group\(text, text, text\)\s+set search_path = pg_catalog/i);
  assert.match(sql, /alter function public\.planning_normalize_asset_name\(text\)\s+set search_path = pg_catalog/i);
});

test('MOTIL private storage no longer grants broad API-role object access', async () => {
  const sql = await readFile(storageMigrationUrl, 'utf8');
  assert.match(sql, /drop policy if exists "maintenance_workbook_manifests_server_only" on storage\.objects/i);
  assert.doesNotMatch(sql, /create policy/i);
});

test('MOTIL Blob upload route never returns the account-level token', async () => {
  const source = await readFile(blobUploadRouteUrl, 'utf8');
  assert.doesNotMatch(source, /clientToken\s*:\s*token/);
  assert.doesNotMatch(source, /x-get-client-token/);
  assert.match(source, /handleUpload\(/);
  assert.match(source, /organizationId:\s*auth\.organizationId/);
});
