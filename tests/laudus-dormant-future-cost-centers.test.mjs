import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261107194700_fix_dormant_cost_center_resolution_method.sql', import.meta.url);
const syncPath = new URL('../lib/integrations/laudus/financial-master-sync.ts', import.meta.url);

test('future Laudus cost centers without real activity become dormant not human work', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /substring\(coalesce\(l\.name,''\) from '\(20\[0-9\]\{2\}\)'\)/);
  assert.match(sql, /reconciliation_status='ignored'/);
  assert.match(sql, /deterministic_rule/);
  assert.match(sql, /laudus:cost_center_pending:/);
  assert.match(sql, /Centro Laudus futuro sin actividad financiera ni operacional/);
  assert.match(sql, /canonical_mutated',false/);
  assert.match(sql, /laudus_mutated',false/);
});

test('dormant cost center reactivates when first real activity appears', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /integration\.laudus_accounting_entries/);
  assert.match(sql, /integration\.laudus_purchase_payment_allocations/);
  assert.match(sql, /canonical\.purchase_orders/);
  assert.match(sql, /canonical\.purchase_order_lines/);
  assert.match(sql, /canonical\.procurement_requests/);
  assert.match(sql, /canonical\.assets/);
  assert.match(sql, /canonical\.asset_costs/);
  assert.match(sql, /status='open'/);
  assert.match(sql, /reactivated/);
});

test('financial master sync classifies dormant centers after normal reconciliation', async () => {
  const sync = await readFile(syncPath, 'utf8');
  assert.match(sync, /motil_reconcile_laudus_financial_masters/);
  assert.match(sync, /motil_classify_dormant_laudus_cost_centers/);
  assert.match(sync, /dormantCostCenters/);
});
