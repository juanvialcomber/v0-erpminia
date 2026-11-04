import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const api = fs.readFileSync('app/api/procurement/suppliers-360/route.ts','utf8');
const page = fs.readFileSync('app/dashboard/compras/proveedores-360/page.tsx','utf8');

test('supplier 360 links Laudus finance only through reconciled canonical supplier identity', () => {
  assert.match(api,/laudus_suppliers_service_v1/);
  assert.match(api,/\.eq\('canonical_supplier_id', supplierId\)/);
  assert.match(api,/if \(laudusSupplier\?\.external_id\)/);
  assert.doesNotMatch(api,/ilike.*supplier_name|supplier_name.*ilike/i);
});

test('Laudus financial history stays tenant scoped, bounded and read only', () => {
  assert.match(api,/laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(api,/\.eq\('organization_id', context\.organizationId\)/);
  assert.match(api,/\.limit\(1000\)/);
  assert.match(api,/readOnly: true/);
  assert.match(api,/canonicalMutated: false/);
  assert.doesNotMatch(api,/source_payload/);
});

test('supplier finance never publishes incomplete aggregate totals', () => {
  assert.match(api,/const complete = totalRows <= rows\.length/);
  assert.match(api,/summaryByCurrency: complete \? Array\.from\(byCurrency\.values\(\)/);
  assert.match(page,/Cobertura parcial/);
  assert.match(page,/No se publican totales incompletos/);
});

test('supplier finance aggregates separately by currency', () => {
  assert.match(api,/const byCurrency = new Map<string/);
  assert.match(api,/byCurrency\.get\(currency\)/);
  assert.match(api,/byCurrency\.set\(currency, current\)/);
  assert.match(page,/moneyFor\(summary\.currency/);
});

test('supplier 360 distinguishes operational invoices from Laudus accounting evidence', () => {
  assert.match(page,/Facturas operacionales/);
  assert.match(page,/Finanzas · Laudus/);
  assert.match(page,/Laudus conserva la autoridad contable/);
  assert.match(page,/Sin vínculo financiero confirmado/);
});

test('supplier 360 exposes source freshness and health without infrastructure details', () => {
  assert.match(api,/laudus_sync_health_service_v1/);
  assert.match(page,/fuente saludable/);
  assert.match(page,/fuente requiere revisión/);
  assert.doesNotMatch(page,/supplierExternalId|source_payload|JWT|endpoint/i);
});


test('supplier 360 detail minimizes canonical payload before returning it to the browser', () => {
  assert.match(api,/\.select\('id,tax_id,legal_name,trade_name,business_activity,payment_terms,address,commune,region,country,phone,email,is_active,validation_status'\)/);
  assert.doesNotMatch(api,/\.from\('canonical_suppliers_v1'\)[\s\S]{0,120}\.select\('\*'\)/);
  assert.doesNotMatch(api,/source_hash|source_file|source_row|import_batch_id|source_payload/);
});

test('Laudus payment states are translated to product language', () => {
  assert.match(page,/partially_paid: 'Pago parcial'/);
  assert.match(page,/credit_adjustment: 'Ajuste de crédito'/);
});
