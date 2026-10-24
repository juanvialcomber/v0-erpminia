import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const accounting = readFileSync(
  new URL('../lib/integrations/laudus/accounting-readiness.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../supabase/migrations/20261024153000_laudus_private_schema_service_facades.sql', import.meta.url),
  'utf8',
);

test('accounting readiness uses public service facades for private canonical evidence', () => {
  assert.ok(accounting.includes('canonical_cost_centers_service_v1'));
  assert.ok(accounting.includes('canonical_assets_service_v1'));
  assert.ok(accounting.includes('laudus_source_status_service_v1'));
  assert.equal(accounting.includes(".schema('integration')"), false);
  assert.equal(accounting.includes('.schema("integration")'), false);
  assert.equal(accounting.includes(".schema('canonical')"), false);
  assert.equal(accounting.includes('.schema("canonical")'), false);
});

test('private Laudus facades are service-role only and security invoker', () => {
  assert.ok(migration.includes('security_invoker = true'));
  assert.ok(
    migration.includes(
      'revoke all on public.laudus_purchase_invoice_payment_status_service_v1 from public, anon, authenticated',
    ),
  );
  assert.ok(
    migration.includes(
      'grant select on public.laudus_purchase_invoice_payment_status_service_v1 to service_role',
    ),
  );
  assert.ok(
    migration.includes(
      'grant execute on function public.motil_record_laudus_finance_review_feedback',
    ),
  );
  assert.equal(/grant select .* to anon/i.test(migration), false);
  assert.equal(/grant select .* to authenticated/i.test(migration), false);
});

test('feedback RPC is security invoker and cannot mutate canonical finance', () => {
  assert.ok(migration.includes('motil_record_laudus_finance_review_feedback'));
  assert.ok(migration.includes('security invoker'));
  assert.equal(/insert into public\.procurement_/i.test(migration), false);
  assert.equal(/update public\.procurement_/i.test(migration), false);
  assert.equal(/update public\.suppliers/i.test(migration), false);
});


test('private service migration keeps forward-compatible canonical facade columns', () => {
  assert.ok(migration.includes('select id, organization_id, cost_center_code'));
  assert.ok(migration.includes('expected_lifespan_years,'));
  assert.ok(migration.includes('asset_code,'));
  assert.ok(migration.includes('cost_center_code'));
});
