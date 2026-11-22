import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isFluidClosureDeclarationCurrent as isCurrent } from '../lib/maintenance/fluid-closure-consistency.mjs';

const profile = 'mechanic-1';
const eventAt = '2026-11-22T12:30:00Z';
const usage = (created_at = '2026-11-22T12:20:00Z') => ({ created_at });
const declaration = (count, fluidsUsed = count > 0, extras = {}) => ({
  actor_id: profile,
  event_at: eventAt,
  payload: {
    fluid_usage_count: count,
    fluids_used: fluidsUsed,
    declared_by_assigned_executor: true,
    ...extras,
  },
});

test('the existing "No" choice still permits closure when no fluids are recorded', () => {
  assert.equal(isCurrent(declaration(0), profile, []), true);
});

test('a verified "Sí" declaration with unchanged fluid records stays valid', () => {
  assert.equal(isCurrent(declaration(1), profile, [usage()]), true);
});

test('a new fluid record after confirmation requires reconfirmation', () => {
  assert.equal(isCurrent(declaration(1), profile, [
    usage(), usage('2026-11-22T12:40:00Z'),
  ]), false);
});

test('same-count replacement after confirmation requires reconfirmation', () => {
  assert.equal(isCurrent(declaration(1), profile, [
    usage('2026-11-22T12:40:00Z'),
  ]), false);
});

test('a previous mechanic declaration cannot be reused after reassignment', () => {
  assert.equal(isCurrent(declaration(1), 'different-mechanic', [usage()]), false);
  assert.equal(isCurrent(declaration(1), null, [usage()]), false);
});

test('missing, invalid or contradictory declarations fail closed', () => {
  assert.equal(isCurrent(null, profile, []), false);
  assert.equal(isCurrent(declaration(1, false), profile, [usage()]), false);
  assert.equal(isCurrent(declaration(0, true), profile, []), false);
  assert.equal(isCurrent(declaration(1, true, { declared_by_assigned_executor: false }), profile, [usage()]), false);
  assert.equal(isCurrent(declaration(1, true, { fluid_usage_count: -1 }), profile, [usage()]), false);
});

test('queue and close API share the mechanic declaration consistency check', () => {
  const queue = readFileSync(resolve('app/api/maintenance/work-order-close-queue/route.ts'), 'utf8');
  const close = readFileSync(resolve('app/api/maintenance/work-orders/[id]/close/route.ts'), 'utf8');
  const ui = readFileSync(resolve('components/maintenance/progressive-work-order-close-queue.tsx'), 'utf8');
  assert.match(queue, /isFluidClosureDeclarationCurrent/);
  assert.match(close, /isFluidClosureDeclarationCurrent/);
  assert.match(queue, /fluid_closure_reconfirmation_required/);
  assert.match(queue, /record_fluid_closure/);
  assert.match(ui, /fluid_closure_reconfirmation_required/);
  assert.match(ui, /Confirmar aceites y residuos/);
  assert.match(queue, /eq\('organization_id', context\.organizationId\)/);
  assert.match(queue, /offset \+ 50/);
  assert.match(close, /requireAssignedMaintenanceExecution/);
  assert.match(close, /close_work_order_safely/);
});

test('the previously activated optional-materials migration has valid SQL delimiters', () => {
  const migration = readFileSync(resolve('supabase/migrations/20261122183000_motil_materials_optional_transition.sql'), 'utf8');
  assert.match(migration, /as \$transition\$\s+select true;\s+\$transition\$;/);
  assert.match(migration, /grant execute on function public\.motil_ot_materials_transition_ready_v1\(\)\s+to service_role;/);
});
