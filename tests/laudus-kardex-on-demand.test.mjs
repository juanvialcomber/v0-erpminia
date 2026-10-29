import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/integrations/laudus/kardex-sync/route.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029223000_laudus_kardex_on_demand.sql','utf8');

test('kardex sync is on-demand admin-only and one product at a time',()=>{
  assert.match(route,/resolveDataHealthAccess/);
  assert.match(route,/access\.admin/);
  assert.match(route,/productId Laudus inválido/);
  assert.match(route,/\/production\/products\/\$\{encodeURIComponent\(productId\)\}\/kardex/);
  assert.doesNotMatch(route,/cron/i);
});

test('kardex request is usage tracked and bounded before persistence',()=>{
  assert.match(route,/withLaudusApiUsageTracking/);
  assert.match(route,/rows\.length > 500/);
  assert.match(route,/motil_ingest_laudus_product_kardex/);
  assert.match(route,/canonicalMutated: false/);
  assert.match(route,/laudusMutated: false/);
});

test('kardex staging preserves verified Swagger v2 movement fields and is service-role only',()=>{
  for (const field of ['movementId','date','movementType','description','quantity','stock']) {
    assert.match(migration,new RegExp(field));
  }
  assert.match(migration,/integration\.laudus_product_kardex/);
  assert.match(migration,/staging_only/);
  assert.match(migration,/revoke all on function public\.motil_ingest_laudus_product_kardex\(uuid,text,jsonb\)/);
  assert.match(migration,/grant execute on function public\.motil_ingest_laudus_product_kardex\(uuid,text,jsonb\)[\s\S]*to service_role/);
});
