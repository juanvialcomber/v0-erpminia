import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/integrations/laudus/coverage/route.ts', import.meta.url), 'utf8');
const page = readFileSync(new URL('../app/dashboard/calidad-datos/laudus/page.tsx', import.meta.url), 'utf8');
const layout = readFileSync(new URL('../app/dashboard/calidad-datos/layout.tsx', import.meta.url), 'utf8');

test('Laudus coverage endpoint uses public service views and never converts unavailable evidence to zero', () => {
  for (const view of [
    'laudus_suppliers_service_v1',
    'laudus_warehouses_service_v1',
    'laudus_cost_centers_service_v1',
    'laudus_fixed_assets_service_v1',
    'laudus_purchase_invoices_service_v1',
    'laudus_purchase_payments_service_v1',
    'laudus_accounts_payable_service_v1',
    'laudus_bank_statements_service_v1',
    'laudus_accounting_entries_service_v1',
    'laudus_credit_notes_service_v1',
    'laudus_dtes_service_v1',
  ]) {
    assert.match(route, new RegExp(view));
  }
  assert.doesNotMatch(route, /schema\('integration'\)/);
  assert.match(route, /records: null/);
  assert.match(route, /status: 'unavailable'/);
  assert.match(route, /verifiedDatasets = allDatasets\.filter/);
  assert.match(route, /verifiedRecords = verifiedDatasets\.reduce/);
  assert.match(route, /row\.records \?\? 0/);
  assert.match(route, /verifiedDatasets: verifiedDatasets\.length/);
  assert.match(route, /unavailableDatasets/);
  assert.doesNotMatch(route, /sum \+ \(row\.records \|\| 0\)/);
  assert.doesNotMatch(route, /insert\(|update\(|upsert\(|delete\(/);
});
test('Laudus quality page combines coverage, public capability discovery and reconciliation issues', () => {
  assert.match(page, /\/api\/integrations\/laudus\/coverage/);
  assert.match(page, /\/api\/integrations\/laudus\/discovery-360/);
  assert.match(page, /\/api\/data-quality\/reconciliation/);
  assert.match(page, /Revisiones/);
  assert.match(page, /Detalle técnico de la integración/);
  assert.match(page, /Las diferencias se resuelven desde la conciliación con evidencia/);
  assert.match(page, /title="Información parcial"/);
  assert.match(page, /className="min-h-0 items-start px-4 py-3 text-left/);
  assert.match(page, /Registros verificados/);
  assert.match(page, /Cobertura verificable/);
});

test('Data quality navigation exposes the Laudus section', () => {
  assert.match(layout, /\/dashboard\/calidad-datos\/laudus/);
  assert.match(layout, />Laudus</);
  assert.doesNotMatch(layout, /\\\\n/);
});
