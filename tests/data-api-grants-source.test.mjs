import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { missingContracts } from '../scripts/check-data-api-grants.mjs';

test('new table without a grant is rejected; commented grants do not count', () => {
  assert.deepEqual(missingContracts('create table public.x(id uuid); -- grant select on public.x to authenticated;'), ['public.x']);
  assert.deepEqual(missingContracts('create table public.x(id uuid); grant select on table public.x to service_role;'), []);
  assert.deepEqual(missingContracts('create table public.x(id uuid); grant select on public.y to service_role;'), ['public.x']);
});

test('migration inventory has explicit contracts or reviewed historical grant locations', () => {
  execFileSync(process.execPath, ['scripts/check-data-api-grants.mjs'], {cwd:new URL('../',import.meta.url),stdio:'pipe'});
});

test('forward repair grants only the verified service operations', async () => {
  const root = new URL('../', import.meta.url);
  const contract = JSON.parse(await readFile(new URL('tests/db/data-api-contract.json',root),'utf8'));
  const sql = await readFile(new URL(`supabase/migrations/${contract.forward}`,root),'utf8');
  const code=sql.replace(/--[^\n]*/g,'');
  assert.doesNotMatch(code,/\b(policy|alter\s+default|grant\s+all|security\s+definer|disable\s+row)/i);
  assert.doesNotMatch(code,/\bto\s+(?:anon|authenticated|public)\b/i);
  assert.equal([...code.matchAll(/\bgrant\b/gi)].length,Object.keys(contract.tables).length);
  for (const [table,spec] of Object.entries(contract.tables)) {
    assert.ok(code.includes(`grant ${spec.privileges.join(', ')} on table public.${table} to service_role;`));
  }
});
