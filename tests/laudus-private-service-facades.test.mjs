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
  assert.match(accounting, /canonical_cost_centers_service_v1/);
  assert.match(accounting, /canonical_assets_service_v1/);
  assert.match(accounting, /laudus_source_status_service_v1/);
  assert.doesNotMatch(accounting, /.schema(['"]integration['"])/);
  assert.doesNotMatch(accounting, /.schema(['"]canonical['"])/);
});

test('private Laudus facades are service-role only and security invoker', () => {
  assert.match(migration, /with (security_invoker = true)/);
  assert.match(migration, /revoke all on public.laudus_purchase_invoice_payment_status_service_v1 from public, anon, authenticated/);
  assert.match(migration, /grant select on public.laudus_purchase_invoice_payment_status_service_v1 to service_role/);
  assert.match(migration, /grant execute on function public.motil_record_laudus_finance_review_feedback/);
  assert.doesNotMatch(migration, /grant select .* to anon/i);
  assert.doesNotMatch(migration, /grant select .* to authenticated/i);
});

test('feedback RPC is security invoker and cannot mutate canonical finance', () => {
  assert.match(migration, /motil_record_laudus_finance_review_feedback/);
  assert.match(migration, /security invoker/);
  assert.doesNotMatch(migration, /insert into public.procurement_/i);
  assert.doesNotMatch(migration, /update public.procurement_/i);
  assert.doesNotMatch(migration, /update public.suppliers/i);
});
