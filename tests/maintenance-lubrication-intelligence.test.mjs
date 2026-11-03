import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261103195000_maintenance_lubrication_intelligence.sql', import.meta.url), 'utf8');
const intelligence = readFileSync(new URL('../app/api/maintenance/lubrication/intelligence/route.ts', import.meta.url), 'utf8');
const fluids = readFileSync(new URL('../app/api/maintenance/work-orders/[id]/fluids/route.ts', import.meta.url), 'utf8');
const plans = readFileSync(new URL('../app/api/maintenance/lubrication/plans/route.ts', import.meta.url), 'utf8');
const view = readFileSync(new URL('../components/maintenance/maintenance-lubrication-intelligence.tsx', import.meta.url), 'utf8');
const workOrder = readFileSync(new URL('../components/maintenance/work-order-detail.tsx', import.meta.url), 'utf8');

test('fluid usage and plans are process records, while Bodega remains canonical', () => {
  assert.match(migration, /maintenance_fluid_usage_records/);
  assert.match(migration, /maintenance_fluid_plans/);
  assert.match(migration, /inventory remains canonical in Bodega/);
  assert.match(fluids, /inventoryMutated: false/);
  assert.doesNotMatch(fluids, /from\('inventory_intelligence_position_v1'\)\.update\(/);
  assert.doesNotMatch(fluids, /from\('inventory_intelligence_position_v1'\)\.insert\(/);
  assert.doesNotMatch(fluids, /from\('inventory_intelligence_position_v1'\)\.delete\(/);
});

test('Ariel KPIs use traceable formulas and preserve N\/D when inputs are missing', () => {
  assert.match(intelligence, /actual_input_liters \/ observed_operating_hours/);
  assert.match(intelligence, /actual_cost_clp \/ observed_operating_hours/);
  assert.match(intelligence, /period_days \/ maintenance_frequency_days/);
  assert.match(intelligence, /missingInputsRemainNull: true/);
  assert.match(intelligence, /projectedInputLiters30d: projectedPlans > 0 \? projectedInput30 : null/);
  assert.match(intelligence, /projectedWasteLiters30d: projectedWasteCoveredPlans > 0 \? projectedWaste30 : null/);
});

test('hour projections require runtime evidence explicitly usable for rate metrics', () => {
  assert.match(intelligence, /usable_for_rate_metrics/);
  assert.match(intelligence, /observed_operating_hours/);
  assert.match(intelligence, /first_reading_at/);
  assert.match(intelligence, /last_reading_at/);
});

test('mechanical anomaly is never asserted from a volume difference alone', () => {
  assert.match(intelligence, /review_required/);
  assert.match(intelligence, /anomalyMeansMechanicalFailure: false/);
  assert.match(view, /no significa falla mecánica/);
});

test('planner quantities are explicit and sourceable, never inferred from product names', () => {
  assert.match(plans, /planned_input_liters/);
  assert.match(plans, /planned_waste_liters/);
  assert.match(plans, /liters_per_inventory_unit/);
  assert.match(plans, /source_reference/);
  assert.doesNotMatch(plans, /match\(.+litros|parse.+product_name/i);
});

test('work orders capture fluid input beside waste output', () => {
  assert.match(workOrder, /WorkOrderFluidUsagePanel/);
  assert.match(workOrder, /WorkOrderWastePanel/);
  assert.match(fluids, /fluid_usage_reported/);
});

test('warehouse planning uses canonical lubricant inventory and explicit conversion', () => {
  assert.match(intelligence, /inventory_intelligence_position_v1/);
  assert.match(intelligence, /family', 'Lubricante'/);
  assert.match(intelligence, /liters_per_inventory_unit/);
  assert.match(intelligence, /available_stock_liters - projected_input_liters_30d/);
});

test('multi-tenant boundaries cover both usage and plans', () => {
  assert.match(migration, /maintenance_fluid_usage_org_isolation/);
  assert.match(migration, /maintenance_fluid_plans_org_isolation/);
  assert.match(migration, /current_application_user_id/);
  assert.match(migration, /maintenance_work_orders/);
  assert.match(migration, /preventive_maintenance_schedules/);
});
