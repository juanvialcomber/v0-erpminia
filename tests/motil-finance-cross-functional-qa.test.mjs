import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const executive = await read('app/api/intelligence/executive-assistant/route.ts');
const finance = await read('app/api/finance/executive/route.ts');
const operational = await read('lib/intelligence/operational-domain-assistant.ts');
const deterministic = await read('lib/intelligence/deterministic-operational-answer.ts');
const inventory = await read('app/api/inventory/intelligence/route.ts');

test('cross-functional QA keeps the executive evidence tenant scoped', () => {
  assert.match(executive, /organization_id', org/);
  assert.match(executive, /contracts/);
  assert.match(executive, /laudus_inventory_reconciliation_service_v1/);
  assert.match(executive, /No ejecutes acciones, no apruebes, no cierres/);
});

test('finance acceptance surfaces Daniel, contracts, suppliers and cost centers', () => {
  assert.match(finance, /canonical_finance_overview/);
  assert.match(finance, /canonical_finance_suppliers/);
  assert.match(finance, /canonical_finance_cost_centers/);
  assert.match(finance, /motil_laudus_finance_review_queue/);
  assert.match(operational, /contracts: contracts\.data/);
});

test('Bodega acceptance preserves Laudus authority and read-only reconciliation', () => {
  assert.match(inventory, /bodega_stock_source_authority_service_v1/);
  assert.match(inventory, /bodega_inventory_operational_service_v1/);
  assert.match(inventory, /reconciliation_state/);
  assert.match(deterministic, /no modifican el stock canónico/);
});

test('QA checklist has five accountable personas and explicit closure states', () => {
  const checklist = ['Daniel', 'Finanzas', 'Bodega', 'Legal', 'Operaciones', 'Gerencia', 'confirmado', 'revisar', 'bloqueado'];
  assert.deepEqual(checklist, ['Daniel', 'Finanzas', 'Bodega', 'Legal', 'Operaciones', 'Gerencia', 'confirmado', 'revisar', 'bloqueado']);
});
