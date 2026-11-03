import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/finance/tax-reconciliation/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/finance/tax-reconciliation-card.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/dashboard/finanzas/trazabilidad/page.tsx', import.meta.url), 'utf8');
const client = readFileSync(new URL('../lib/integrations/n3uralia-tax/client.ts', import.meta.url), 'utf8');

test('tax reconciliation preserves document semantics', () => {
  assert.match(route, /inbound_invoice/);
  assert.match(route, /outbound_invoice/);
  assert.match(route, /waybill/);
  assert.match(route, /const comparable = direction === 'inbound_invoice'/);
  assert.match(route, /outbound_invoice'\) motilStatus = 'not_modeled'/);
  assert.match(route, /!comparable\) motilStatus = 'not_comparable'/);
});

test('SII is organization-scoped and never reported connected without its own certificate', () => {
  assert.match(client, /N3URALIA_TAX_MOTIL_TOKEN/);
  assert.match(client, /certificates\/status/);
  assert.match(route, /getTaxCoreOrganizationCertificateStatus\(context\.organizationId\)/);
  assert.match(route, /certificateConfigured/);
  assert.match(route, /siiWritesEnabled: false/);
  assert.match(card, /Requiere certificado propio de La Patagua/);
});

test('traceability exposes the three-source reconciliation without write actions', () => {
  assert.match(page, /TaxReconciliationCard/);
  assert.match(card, /Laudus · MOTIL · SII/);
  assert.match(card, /Conciliación tributaria/);
  assert.doesNotMatch(card, /Emitir|Presentar|Pagar|Rectificar/);
  assert.doesNotMatch(route, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});
