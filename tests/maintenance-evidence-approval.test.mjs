import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const component = await readFile(new URL('../components/maintenance/work-order-evidence-and-approval.tsx', import.meta.url), 'utf8');
const reviewRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/review/route.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261007033500_work_order_supervisor_reviews.sql', import.meta.url), 'utf8');

test('completed OT shows a durable evidence list', () => {
  assert.match(component, /Evidencia fotográfica/);
  assert.match(component, /\/evidence/);
  assert.match(component, /photo\.signed_url/);
  assert.match(component, /photo\.file_name/);
  assert.doesNotMatch(component, /tagLabel/);
  assert.doesNotMatch(component, /evidence_tag/);
});

test('approval uses the canonical authorized-supervisor contract', async () => {
  const reviewerAccess = await readFile(new URL('../lib/maintenance/work-order-review-access.ts', import.meta.url), 'utf8');
  assert.match(reviewRoute, /isAuthorizedMaintenanceReviewerName/);
  assert.match(reviewerAccess, /Ariel López/);
  assert.match(reviewerAccess, /Mauricio Astudillo/);
  assert.match(reviewRoute, /supervisor autorizado/);
  assert.match(reviewRoute, /approve_work_order_with_material_confirmation_v1/);
  assert.match(reviewRoute, /p_confirm_materials_installed/);
});

test('approval is separate from execution truth and is audited', async () => {
  assert.match(migration, /work_order_supervisor_reviews/);
  assert.match(migration, /unique \(organization_id, work_order_id\)/);
  const approvalMigration = await readFile(new URL('../supabase/migrations/20261009141000_defer_material_reconciliation_until_supervisor_approval.sql', import.meta.url), 'utf8');
  assert.match(approvalMigration, /'supervisor_approved'/);
  assert.match(component, /Pendiente de aprobación/);
});


test('supervisor installation confirmation never mutates warehouse or stock movements', async () => {
  const sql = await readFile(new URL('../supabase/migrations/20261009141000_defer_material_reconciliation_until_supervisor_approval.sql', import.meta.url), 'utf8');
  assert.match(sql, /create table if not exists public\.work_order_material_approval_installations/i);
  assert.match(sql, /warehouse_reconciliation_status text not null default 'pending'/);
  assert.match(sql, /p_confirm_materials_installed is distinct from true/);
  assert.match(sql, /on conflict \(organization_id, work_order_id, requirement_id\) do nothing/);
  assert.doesNotMatch(sql, /update public\.warehouse_stock/i);
  assert.doesNotMatch(sql, /insert into public\.stock_movements/i);
  assert.doesNotMatch(sql, /update public\.work_order_supply_needs/i);
  assert.doesNotMatch(sql, /update public\.procurement_operational_orders/i);
});
