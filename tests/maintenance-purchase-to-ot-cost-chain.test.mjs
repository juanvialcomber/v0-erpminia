import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const receiptMigration = fs.readFileSync('supabase/migrations/20261029175000_fix_procurement_receipt_delivery_date.sql','utf8');
const reservationMigration = fs.readFileSync('supabase/migrations/20260827192500_reserve_work_order_inventory_v1.sql','utf8');
const finalCostMigration = fs.readFileSync('supabase/migrations/20260827213000_work_order_final_cost_closure_snapshot_v1.sql','utf8');
const materialsRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/materials/route.ts','utf8');
const materialCoverage = fs.readFileSync('components/maintenance/work-order-material-coverage.tsx','utf8');
const partsPanel = fs.readFileSync('components/maintenance/work-order-parts-panel.tsx','utf8');

test('purchase receipt preserves OT asset product and cost provenance', () => {
  assert.match(receiptMigration,/stock_movements/);
  assert.match(receiptMigration,/work_order_id/);
  assert.match(receiptMigration,/canonical_asset_id/);
  assert.match(receiptMigration,/canonical_product_id/);
  assert.match(receiptMigration,/unit_cost/);
  assert.match(receiptMigration,/v_accepted \* v_ol\.unit_cost/);
  assert.match(receiptMigration,/reference_doc[\s\S]*operational_receipt/);
});

test('receiving a purchase for an OT refreshes supply coverage and reserves available material', () => {
  assert.match(receiptMigration,/recalculate_work_order_material_coverage/);
  assert.match(reservationMigration,/perform public\.reserve_available_materials_to_work_order_v1/);
  assert.match(reservationMigration,/status = 'reserved'/);
});

test('material handoff stays human controlled through one canonical issue action', () => {
  assert.match(materialCoverage,/\/issue-materials/);
  assert.match(materialCoverage,/Entregar reservas/);
  assert.match(reservationMigration,/issue_available_materials_to_work_order_v2/);
  assert.match(reservationMigration,/source','explicit_reservation/);
  assert.doesNotMatch(partsPanel,/\/issue-materials/);
});

test('OT materials exposes explicit purchase receipt provenance without inference', () => {
  assert.match(materialsRoute,/stock_movements/);
  assert.match(materialsRoute,/movement_type', 'receipt'/);
  assert.match(materialsRoute,/reference_doc', 'operational_receipt'/);
  assert.match(materialsRoute,/purchase_received/);
  assert.match(materialCoverage,/Compra recibida/);
  assert.match(partsPanel,/Compra recibida/);
});

test('parts cost is recognized only from installed parts while purchase receipt remains evidence-only', () => {
  assert.match(finalCostMigration,/quantity_installed/);
  assert.match(finalCostMigration,/parts_cost/);
  assert.match(finalCostMigration,/procurement_received_cost_is_evidence_only/);
  assert.doesNotMatch(finalCostMigration,/coalesce\(parts\.parts_cost,0\) \+ coalesce\(procurement\.procurement_received_cost/);
});
