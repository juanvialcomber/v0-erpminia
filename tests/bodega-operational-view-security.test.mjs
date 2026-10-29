import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261029225500_harden_bodega_operational_stock_view.sql', import.meta.url);
const contextPath = new URL('../lib/api/organization-context.ts', import.meta.url);

test('Bodega operational stock view is server-only after hardening', async () => {
  const migration = await readFile(migrationPath, 'utf8');
  const context = await readFile(contextPath, 'utf8');

  assert.match(migration, /revoke all on public\.bodega_inventory_operational_service_v1[\s\S]*from public, anon, authenticated, service_role/i);
  assert.match(migration, /grant select on public\.bodega_inventory_operational_service_v1[\s\S]*to service_role/i);
  assert.match(context, /getSupabaseServerClient\(auth\.user\.id\)/);
});
