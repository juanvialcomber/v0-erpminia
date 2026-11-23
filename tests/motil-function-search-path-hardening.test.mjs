import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20261123170000_pin_pure_function_search_paths.sql',
  import.meta.url,
);

test('pure MOTIL SQL helpers resolve built-ins from a fixed safe schema', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /alter function public\.motil_media_visual_group\(text, text, text\)\s+set search_path = pg_catalog/i);
  assert.match(sql, /alter function public\.planning_normalize_asset_name\(text\)\s+set search_path = pg_catalog/i);
});
