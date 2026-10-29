import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const finance = fs.readFileSync('lib/integrations/laudus/finance-control.ts', 'utf8');
const invoicePo = fs.readFileSync('lib/integrations/laudus/invoice-po-control.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261029145500_laudus_finance_service_views.sql', 'utf8');

test('finance loaders do not address the private integration schema through PostgREST', () => {
  assert.equal(finance.includes(".schema('integration')"), false);
  assert.equal(invoicePo.includes(".schema('integration')"), false);
});

test('finance control uses public service projections', () => {
  for (const view of [
    'laudus_purchase_payments_detail_service_v1',
    'laudus_credit_notes_service_v1',
    'laudus_cost_centers_service_v1',
    'laudus_accounting_entries_service_v1',
    'laudus_fixed_assets_service_v1',
    'laudus_suppliers_service_v1',
  ]) {
    assert.match(finance, new RegExp(view));
  }
});

test('invoice PO control uses public service projections', () => {
  for (const view of [
    'laudus_purchase_invoice_payment_status_service_v1',
    'laudus_purchase_invoice_lines_service_v1',
    'laudus_purchase_orders_service_v1',
    'laudus_purchase_order_lines_service_v1',
  ]) {
    assert.match(invoicePo, new RegExp(view));
  }
});

test('new service projections stay service-role only', () => {
  assert.match(migration, /revoke all on public\.laudus_purchase_payments_detail_service_v1 from anon, authenticated/i);
  assert.match(migration, /grant select on public\.laudus_purchase_payments_detail_service_v1 to service_role/i);
  assert.match(migration, /revoke all on public\.laudus_purchase_order_lines_service_v1 from anon, authenticated/i);
  assert.match(migration, /grant select on public\.laudus_purchase_order_lines_service_v1 to service_role/i);
});
