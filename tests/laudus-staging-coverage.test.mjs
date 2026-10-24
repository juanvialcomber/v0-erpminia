import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const model = readFileSync(new URL('../lib/integrations/laudus/model.ts', import.meta.url), 'utf8');
const staging = readFileSync(
  new URL('../supabase/migrations/20261024155500_complete_laudus_staging_coverage.sql', import.meta.url),
  'utf8',
);
const refresh = readFileSync(
  new URL('../supabase/migrations/20261024160500_refresh_laudus_financial_staging.sql', import.meta.url),
  'utf8',
);

test('all declared Laudus entity types have normalized staging coverage', () => {
  for (const entityType of [
    'product','supplier','warehouse','stock','cost_center','purchase_order','purchase_order_line',
    'supplier_invoice','supplier_invoice_line','accounts_payable','payment','credit_note',
    'fixed_asset','accounting_entry','bank_statement','dte',
  ]) {
    assert.ok(model.includes("'" + entityType + "'"));
  }

  for (const table of [
    'laudus_accounts_payable',
    'laudus_credit_notes',
    'laudus_accounting_entries',
    'laudus_bank_statements',
    'laudus_dtes',
  ]) {
    assert.ok(staging.includes('integration.' + table));
  }
});

test('new finance staging is tenant scoped, lossless and service-role only', () => {
  for (const field of [
    'organization_id uuid not null',
    'source_id uuid not null',
    'external_id text not null',
    'payload_hash text not null',
    'source_payload jsonb not null',
    'observed_at timestamptz not null',
    'synced_at timestamptz not null',
  ]) {
    assert.ok(staging.includes(field));
  }
  assert.match(staging, /enable row level security/);
  assert.match(staging, /revoke all .* from public, anon, authenticated/);
  assert.match(staging, /grant select, insert, update .* to service_role/);
});

test('payable and credit refresh derives only from Laudus staging and never mutates canonical finance', () => {
  assert.match(refresh, /laudus_purchase_invoice_payment_status_v1/);
  assert.match(refresh, /laudus_purchase_invoices/);
  assert.match(refresh, /on conflict \(organization_id,source_id,external_id\) do update/);
  assert.doesNotMatch(refresh, /insert into canonical\.|update canonical\.|insert into public\.procurement_|update public\.procurement_/i);
  assert.match(refresh, /canonical_mutated',false/);
  assert.match(refresh, /laudus_mutated',false/);
});
