import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20261009141000_defer_material_reconciliation_until_supervisor_approval.sql', import.meta.url), 'utf8');
const closeRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/close/route.ts', import.meta.url), 'utf8');
const reviewRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/review/route.ts', import.meta.url), 'utf8');
const reviewComponent = await readFile(new URL('../components/maintenance/work-order-evidence-and-approval.tsx', import.meta.url), 'utf8');

test('Joaquin or other assigned executor can close the work without installing materials or approving it', () => {
  assert.match(closeRoute, /requireAssignedMaintenanceExecution/);
  assert.match(migration, /pe\.id = v_wo\.assigned_person_id/);
  assert.match(migration, /status = 'completed'/);
  assert.doesNotMatch(migration, /raise exception 'Hay repuestos requeridos/);
  assert.doesNotMatch(migration, /update public\.work_order_supply_needs/);
  assert.doesNotMatch(closeRoute, /approve_work_order_with_material_confirmation_v1/);
});

test('Ariel and Mauricio are the application reviewers and explicitly confirm installed materials', () => {
  assert.match(reviewRoute, /getReviewerPerson/);
  assert.match(reviewRoute, /Ariel López/);
  assert.match(reviewRoute, /Mauricio Astudillo/);
  assert.match(reviewRoute, /Solo Ariel López o Mauricio Astudillo pueden revisar y aprobar la OT/);
  assert.match(reviewRoute, /p_confirm_materials_installed/);
  assert.match(reviewComponent, /confirmMaterialsInstalled/);
  assert.match(migration, /warehouse_reconciliation_status text not null default 'pending'/);
  assert.match(migration, /on conflict \(organization_id, work_order_id, requirement_id\) do nothing/);
});
