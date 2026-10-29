import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const loader = fs.readFileSync('lib/integrations/laudus/invoice-po-control.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029205500_laudus_invoice_po_service_views.sql','utf8');

test('invoice PO control does not access the private integration schema directly',()=>{
  assert.doesNotMatch(loader,/\.schema\('integration'\)/);
  assert.match(loader,/laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(loader,/laudus_purchase_invoice_lines_service_v1/);
  assert.match(loader,/laudus_purchase_orders_service_v1/);
  assert.match(loader,/laudus_purchase_order_lines_service_v1/);
});

test('invoice PO service views are server-only',()=>{
  assert.match(migration,/revoke all on public\.laudus_purchase_invoice_lines_service_v1 from public, anon, authenticated/);
  assert.match(migration,/grant select on public\.laudus_purchase_invoice_lines_service_v1 to service_role/);
  assert.match(migration,/grant select on public\.laudus_purchase_orders_service_v1 to service_role/);
  assert.match(migration,/grant select on public\.laudus_purchase_order_lines_service_v1 to service_role/);
});
