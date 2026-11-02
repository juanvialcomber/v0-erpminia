import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/integrations/laudus/coverage/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/dashboard/calidad-datos/laudus/page.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/dashboard/calidad-datos/layout.tsx', import.meta.url), 'utf8');

test('Laudus coverage endpoint inventories all staged operational datasets read-only', () => {
  for (const table of [
    'laudus_products',
    'laudus_suppliers',
    'laudus_warehouses',
    'laudus_cost_centers',
    'laudus_fixed_assets',
    'laudus_product_stock',
    'laudus_purchase_orders',
    'laudus_purchase_invoices',
    'laudus_purchase_payments',
    'laudus_accounts_payable',
    'laudus_bank_statements',
    'laudus_accounting_entries',
    'laudus_waybills',
  ]) {
    assert.match(route, new RegExp(table));
  }
  assert.match(route, /head: true/);
  assert.doesNotMatch(route, /insert\(|update\(|upsert\(|delete\(/);
});

test('Laudus quality page combines coverage, public capability discovery and reconciliation issues', () => {
  assert.match(page, /\/api\/integrations\/laudus\/coverage/);
  assert.match(page, /\/api\/integrations\/laudus\/discovery-360/);
  assert.match(page, /\/api\/data-quality\/reconciliation/);
  assert.match(page, /Revisiones/);
  assert.match(page, /Detalle técnico de la integración/);
  assert.match(page, /Las diferencias se resuelven desde la conciliación con evidencia/);
});

test('Data quality navigation exposes the Laudus section', () => {
  assert.match(layout, /\/dashboard\/calidad-datos\/laudus/);
  assert.match(layout, />Laudus</);
});
