import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const catalog = await readFile(new URL('../lib/legal/contract-purchase-order-candidates.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/legal/contract-po-reconciliation/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/laudus/page.tsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261106183000_legal_contract_purchase_order_links.sql', import.meta.url), 'utf8');

test('contract OC candidates preserve workbook provenance', () => {
  assert.match(catalog, /Planilla Avance Contratos - Con resumen\.xlsx/);
  assert.match(catalog, /b7eb275ec0b86e5867ece489a714c48a09033342403deb65fd719ad9c9c29317/);
  assert.match(catalog, /IO-01/);
  assert.match(catalog, /27712/);
  assert.match(catalog, /IO-02/);
  assert.match(catalog, /29501/);
  assert.match(catalog, /EP-03/);
  assert.match(catalog, /28490/);
});

test('contract OC reconciliation fails closed when canonical OC is absent or supplier conflicts', () => {
  assert.match(api, /canonical_purchase_orders_v1/);
  assert.match(api, /status = 'not_found'/);
  assert.match(api, /status = 'conflict'/);
  assert.match(api, /normalize\(supplier\.rut\) !== normalize\(po\.supplier_tax_id\)/);
  assert.match(api, /status = 'verified'/);
  assert.match(api, /OC canónica encontrada y proveedor compatible/);
});

test('Legal OC reconciliation UI exposes verification states and provenance', () => {
  assert.match(page, /Conciliación Contrato ↔ OC/);
  assert.match(page, /Verificadas/);
  assert.match(page, /Conflictos/);
  assert.match(page, /No encontradas/);
  assert.match(page, /source_sheet/);
  assert.match(page, /source_cell/);
  assert.match(page, /payment_link/);
});

test('ledger schema is human-reviewed and does not seed guessed links', () => {
  assert.match(migration, /legal_contract_purchase_order_links/);
  assert.match(migration, /pending','verified','conflict','not_found/);
  assert.match(migration, /source_file_sha256/);
  assert.match(migration, /verified_by/);
  assert.match(migration, /verified_at/);
  assert.doesNotMatch(migration, /insert into public\.legal_contract_purchase_order_links/i);
  assert.match(migration, /service_role/);
});
