import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const migration=fs.readFileSync('supabase/migrations/20261029164000_laudus_sync_control_plane.sql','utf8');

test('sync control plane separates policy state and incidents from run history',()=>{
  assert.match(migration,/create table if not exists integration\.sync_policies/);
  assert.match(migration,/create table if not exists integration\.sync_domain_state/);
  assert.match(migration,/create table if not exists integration\.sync_incidents/);
  assert.match(migration,/references integration\.sync_runs\(id\)/);
  assert.match(migration,/unique \(source_id, domain\)/);
});

test('Laudus stock policy is physical-only and sequenced after products',()=>{
  assert.match(migration,/\('products', '0 \*\/6 \* \* \*'.*10/s);
  assert.match(migration,/\('stock', '10 \*\/6 \* \* \*'.*20/s);
  assert.match(migration,/\"warehouse_external_ids\":\[\"001\",\"002\",\"003\",\"004\"\]/);
  assert.match(migration,/\"physical_only\":true/);
});

test('sync control tables are private and service-role only',()=>{
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on integration\.sync_policies from public, anon, authenticated/);
  assert.match(migration,/grant select, insert, update, delete on integration\.sync_domain_state to service_role/);
  assert.match(migration,/with \(security_invoker = true\)/);
  assert.match(migration,/revoke all on public\.laudus_sync_health_service_v1 from public, anon, authenticated/);
});


const syncPolicy = fs.readFileSync('lib/integrations/laudus/sync-policy.ts','utf8');

test('runtime sync control writes through the public RPC instead of private schema access',()=>{
  assert.match(syncPolicy,/motil_record_laudus_sync_control/);
  assert.doesNotMatch(syncPolicy,/schema\('integration'\)/);
  assert.match(syncPolicy,/p_event: event/);
  assert.match(syncPolicy,/p_api_calls/);
});
