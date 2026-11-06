import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/legal/laudus-bridge/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/laudus/page.tsx', import.meta.url), 'utf8');
const legalHome = await readFile(new URL('../app/dashboard/legal/page.tsx', import.meta.url), 'utf8');

test('Legal Laudus bridge is read-only, tenant-scoped and authorization-gated', () => {
  assert.match(api, /getOrganizationContext/);
  assert.match(api, /MODULE_KEYS\.LEGAL_MODULO/);
  assert.match(api, /access !== 'ED' && access !== 'LEC'/);
  assert.match(api, /\.eq\('organization_id', context\.organizationId\)/);
  assert.doesNotMatch(api, /export async function POST/);
  assert.doesNotMatch(api, /\.insert\(|\.update\(|\.delete\(/);
});

test('Legal Laudus bridge keeps supplier-level finance separate from contract payment truth', () => {
  assert.match(api, /laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(api, /exact_contract_payment: false/);
  assert.match(api, /Falta vincular OC\/factura al contrato para atribución exacta/);
  assert.match(api, /Los montos Laudus mostrados son a nivel proveedor y no reemplazan el pagado contractual/);
  assert.match(page, /Pagado contractual/);
  assert.match(page, /Pagado proveedor/);
  assert.match(page, /Exactitud:/);
});

test('Legal workspace exposes what can move out of Laudus and preserves Laudus accounting authority', () => {
  assert.match(api, /can_move_now/);
  assert.match(api, /needs_binding/);
  assert.match(api, /stays_laudus_canonical/);
  assert.match(api, /Contabilidad y libros/);
  assert.match(api, /DTE tributario/);
  assert.match(api, /Pago bancario\/contable ejecutado/);
  assert.match(page, /Puede salir de Laudus ahora/);
  assert.match(page, /Sigue siendo autoridad Laudus/);
  assert.match(legalHome, /\/dashboard\/legal\/laudus/);
});

test('Transport settlements are surfaced as existing MOTIL evidence without mutating source', () => {
  assert.match(api, /transport_settlements/);
  assert.match(page, /Liquidaciones de transportistas/);
  assert.match(page, /Ya fuera de Excel\/Laudus para consulta/);
});
