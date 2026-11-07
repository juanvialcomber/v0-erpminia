import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/legal/laudus-bridge/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/pagos-facturas/page.tsx', import.meta.url), 'utf8');
const legacy = await readFile(new URL('../app/dashboard/legal/laudus/page.tsx', import.meta.url), 'utf8');
const layout = await readFile(new URL('../app/dashboard/legal/layout.tsx', import.meta.url), 'utf8');

test('Legal financial bridge remains read-only, tenant-scoped and authorization-gated', () => {
  assert.match(api, /getOrganizationContext/);
  assert.match(api, /MODULE_KEYS\.LEGAL_MODULO/);
  assert.match(api, /access !== 'ED' && access !== 'LEC'/);
  assert.match(api, /\.eq\('organization_id', context\.organizationId\)/);
  assert.doesNotMatch(api, /export async function POST/);
  assert.doesNotMatch(api, /\.insert\(|\.update\(|\.delete\(/);
});

test('MOTIL separates supplier financial evidence from contract payment truth', () => {
  assert.match(api, /laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(api, /exact_contract_payment: false/);
  assert.match(api, /Falta vincular OC\/factura al contrato para atribución exacta/);
  assert.match(api, /no reemplazan el pagado contractual/);
  assert.match(page, /Pagado contractual/);
  assert.match(page, /Pagado proveedor/);
  assert.match(page, /Precisión:/);
});

test('Elias works in MOTIL payments and invoices, not in a Laudus workspace', () => {
  assert.match(layout, /\/dashboard\/legal\/pagos-facturas/);
  assert.match(layout, /label: 'Pagos y facturas'/);
  assert.doesNotMatch(layout, /\/dashboard\/legal\/laudus/);
  assert.match(page, /Pagos y facturas/);
  assert.match(page, /La procedencia ERP queda en segundo plano/);
  assert.match(legacy, /redirect\('\/dashboard\/legal\/pagos-facturas'\)/);
});

test('financial source health and invoice exceptions are visible without exposing ERP mechanics', () => {
  assert.match(api, /laudus_sync_health_service_v1/);
  assert.match(api, /paid_invoices/);
  assert.match(api, /partial_invoices/);
  assert.match(api, /unpaid_invoices/);
  assert.match(page, /excepciones requieren revisión/);
  assert.match(page, /Información financiera actualizada correctamente/);
});
