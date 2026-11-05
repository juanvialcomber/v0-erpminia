import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261105200500_work_order_rejection_correction_cycle_v1.sql', import.meta.url), 'utf8');
const reviewRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/review/route.ts', import.meta.url), 'utf8');
const closeRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/close/route.ts', import.meta.url), 'utf8');
const component = await readFile(new URL('../components/maintenance/work-order-evidence-and-approval.tsx', import.meta.url), 'utf8');

test('supervisor rejection is explicit, audited and preserves prior closure history', () => {
  assert.match(migration, /status in \('pending','approved','rejected'\)/);
  assert.match(migration, /reject_work_order_supervisor_review_v1/);
  assert.match(migration, /length\(v_note\) < 5/);
  assert.match(migration, /v_review\.status = 'approved'/);
  assert.match(migration, /previous_closure_preserved', true/);
  assert.match(migration, /'supervisor_rejected_for_correction'/);
  assert.doesNotMatch(migration, /delete from public\.work_order_closure_cost_snapshots/i);
});

test('rejection reopens the same assigned OT for correction without changing assignee', () => {
  assert.match(migration, /set status = 'in_progress'/);
  assert.match(migration, /completion_date = null/);
  assert.match(migration, /closed_at = null/);
  assert.match(migration, /start_date = v_now/);
  assert.doesNotMatch(migration, /assigned_person_id =/);
});

test('corrected reclosure resubmits rejected review to pending', () => {
  assert.match(closeRoute, /work_order_supervisor_reviews/);
  assert.match(closeRoute, /status: 'pending'/);
  assert.match(closeRoute, /resubmitted_at/);
  assert.match(closeRoute, /eq\('status', 'rejected'\)/);
});

test('review API separates reject from approval prerequisites', () => {
  assert.match(reviewRoute, /action === 'reject'/);
  assert.match(reviewRoute, /reject_work_order_supervisor_review_v1/);
  const rejectIndex = reviewRoute.indexOf("if (action === 'reject')");
  const fluidIndex = reviewRoute.indexOf("const { data: fluidDeclaration", rejectIndex);
  assert.ok(rejectIndex >= 0 && fluidIndex > rejectIndex, 'reject must happen before approval-only fluid gate');
  assert.match(reviewRoute, /canReject/);
});

test('UI exposes correction reason and explicit return action', () => {
  assert.match(component, /Corrección solicitada/);
  assert.match(component, /Devolver para corregir/);
  assert.match(component, /Corregida y reenviada/);
  assert.match(component, /Motivo de rechazo de OT/);
});


test('rejected OT resubmission is atomic with closure transition', () => {
  assert.match(migration, /resubmit_rejected_work_order_review_on_close_v1/);
  assert.match(migration, /after update of status on public\.maintenance_work_orders/i);
  assert.match(migration, /status = 'pending'/);
  assert.match(migration, /status = 'rejected'/);
  assert.match(migration, /work_order_resubmitted_for_review/);
});
