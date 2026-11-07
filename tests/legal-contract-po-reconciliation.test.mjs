import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const catalog = await readFile(new URL('../lib/legal/contract-purchase-order-candidates.ts', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/legal/contract-po-reconciliation/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/pagos-facturas/page.tsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261106183000_legal_contract_purchase_order_links.sql', import.meta.url), 'utf8');
const normalizeMigration = await readFile(new URL('../supabase/migrations/20261106190000_normalize_laudus_purchase_order_number.sql', import.meta.url), 'utf8');

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
  assert.match(api, /schema\('integration'\)/);
  assert.match(api, /laudus_purchase_orders/);
  assert.match(api, /external_id/);
  assert.match(api, /status = 'not_found'/);
  assert.match(api, /status = 'pending'/);
  assert.match(api, /!supplier\?\.rut/);
  assert.match(api, /!po\.supplier_tax_id/);
  assert.match(api, /status = 'conflict'/);
  assert.match(api, /normalize\(supplier\.rut\) !== normalize\(po\.supplier_tax_id\)/);
  assert.match(api, /status = 'verified'/);
  assert.match(api, /OC encontrada en la fuente financiera y RUT de proveedor compatible/);
});

test('Legal OC reconciliation UI exposes verification states and provenance', () => {
  assert.match(page, /Conciliación contrato ↔ OC/);
  assert.match(page, /verificadas/i);
  assert.match(page, /Conflictos/);
  assert.match(page, /No encontradas/);
  assert.match(page, /source_sheet/);
  assert.match(page, /source_cell/);
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


test('Laudus staging order number normalization is idempotent and integration-only', () => {
  assert.match(normalizeMigration, /update integration\.laudus_purchase_orders/);
  assert.match(normalizeMigration, /set order_number = external_id/);
  assert.match(normalizeMigration, /where order_number is null/);
  assert.match(normalizeMigration, /create trigger normalize_laudus_purchase_order_number/);
  assert.match(normalizeMigration, /before insert or update of external_id, order_number/);
  assert.doesNotMatch(normalizeMigration, /canonical\./);
  assert.doesNotMatch(normalizeMigration, /public\.contracts/);
});
