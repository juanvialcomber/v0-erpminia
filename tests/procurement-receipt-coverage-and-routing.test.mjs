import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const coveragePath = new URL('../supabase/migrations/20261107193800_add_procurement_receipt_coverage_v1.sql', import.meta.url);
const routingPath = new URL('../supabase/migrations/20261107193900_route_native_receipt_backlog_to_bodega.sql', import.meta.url);
const routePath = new URL('../app/api/procurement/receipt-inbox/route.ts', import.meta.url);
const uiPath = new URL('../components/procurement/procurement-receipt-inbox.tsx', import.meta.url);
const bodegaPagePath = new URL('../app/dashboard/bodega/page.tsx', import.meta.url);

test('receipt coverage never treats legacy status or invoice as physical receipt evidence', async () => {
  const sql = await readFile(coveragePath, 'utf8');
  assert.match(sql, /legacy_import/);
  assert.match(sql, /historical_evidence/);
  assert.match(sql, /procurement_request_id is not null/);
  assert.match(sql, /pending_receipt/);
});

test('native receipt backlog is owned by Bodega and supervised by Planning', async () => {
  const sql = await readFile(routingPath, 'utf8');
  assert.match(sql, /JEFE BODEGA/);
  assert.match(sql, /Jefe de Planificación/i);
  assert.match(sql, /receive_native_purchase_orders/);
  assert.match(sql, /supervise_native_purchase_order_receipts/);
  assert.match(sql, /responsibility,[\s\S]*'owner'/);
  assert.match(sql, /'support'::text as responsibility/);
});

test('Bodega receipt inbox only writes native MOTIL orders', async () => {
  const route = await readFile(routePath, 'utf8');
  const ui = await readFile(uiPath, 'utf8');
  const page = await readFile(bodegaPagePath, 'utf8');

  assert.match(route, /MODULE_KEYS\.BODEGA_INVENTARIO/);
  assert.match(route, /order_origin !== 'motil_native'/);
  assert.match(route, /receive_purchase_order/);
  assert.match(route, /invoiceIsPhysicalReceiptEvidence: false/);
  assert.match(ui, /OCs legacy se conservan como evidencia histórica/);
  assert.match(ui, /Confirmar recepción/);
  assert.match(page, /ProcurementReceiptInbox/);
});
