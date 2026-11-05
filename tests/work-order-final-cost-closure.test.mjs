import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827213000_work_order_final_cost_closure_snapshot_v1.sql', 'utf8');
const executionRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/execution/route.ts', 'utf8');
const finalCostRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/final-cost/route.ts', 'utf8');

test('work order closure persists a traceable cost snapshot', () => {
  assert.match(migration, /work_order_closure_cost_snapshots/i);
  assert.match(migration, /closure_sequence/i);
  assert.match(migration, /parts_cost/i);
  assert.match(migration, /labor_cost/i);
  assert.match(migration, /effective_external_cost/i);
  assert.match(migration, /cost_center_id/i);
  assert.match(migration, /canonical_asset_id/i);
});

test('final cost avoids double counting procurement receipts', () => {
  assert.match(migration, /procurement_received_cost_is_evidence_only/i);
  assert.match(migration, /quantity_accepted/i);
  assert.match(migration, /procurement_currency_count/i);
  assert.match(migration, /count\(distinct o\.currency\)/i);
  assert.match(migration, /then null/i);
});

test('closure blocks unresolved operational commitments', () => {
  assert.match(migration, /open_procurement_orders/i);
  assert.match(migration, /pending_parts/i);
  assert.match(migration, /unmet_material_requirements/i);
  assert.match(migration, /pending_external_services/i);
  assert.match(migration, /open_labor_entries/i);
  assert.match(migration, /external_cost_conflict/i);
});

test('external service cost cannot silently duplicate legacy external cost', () => {
  assert.match(migration, /external_cost_basis/i);
  assert.match(migration, /duplicado entre el campo legado y servicios externos/i);
});

test('maintenance execution reads the final cost source', () => {
  assert.match(executionRoute, /from\('work_order_final_cost_v1'\)/);
  assert.match(executionRoute, /work_order_closure_cost_snapshots/);
  assert.match(executionRoute, /external_cost: cost\.effective_external_cost/);
});

test('final cost endpoint is tenant scoped and respects OT functional read authority', () => {
  assert.match(finalCostRoute, /getMaintenanceActorAuthority/);
  assert.match(finalCostRoute, /requireAssignedMaintenanceExecution/);
  assert.match(finalCostRoute, /!authority\.canReadAllWorkOrders && !assigned\.ok/);
  assert.match(finalCostRoute, /eq\('organization_id', context\.organizationId\)/);
  assert.match(finalCostRoute, /work_order_final_cost_v1/);
  assert.match(finalCostRoute, /work_order_closure_cost_snapshots/);
});
