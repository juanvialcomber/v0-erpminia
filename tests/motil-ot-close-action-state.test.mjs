import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { classifyCloseAction } from '../lib/maintenance/close-action-state.mjs';

const ready = {
  canEdit: true,
  canDeclare: true,
  fluidReady: true,
  evidenceReady: true,
  evidenceCount: 1,
  hasError: false,
};
const read = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');

test('only the assigned mechanic can see an executable close action', () => {
  assert.equal(classifyCloseAction(ready), 'ready');
  assert.equal(classifyCloseAction({ ...ready, canDeclare: false }), 'view_only');
  assert.equal(classifyCloseAction({ ...ready, canEdit: false }), 'view_only');
});

test('mechanic with no photo receives the upload action rather than a failing close', () => {
  assert.equal(classifyCloseAction({ ...ready, evidenceCount: 0 }), 'add_photo');
  assert.equal(classifyCloseAction({ ...ready, evidenceCount: -1 }), 'add_photo');
  assert.equal(classifyCloseAction({ ...ready, evidenceCount: NaN }), 'add_photo');
  assert.equal(classifyCloseAction({ ...ready, evidenceCount: 2 }), 'ready');
});

test('unverified evidence or identity cannot offer the close button', () => {
  assert.equal(classifyCloseAction({ ...ready, fluidReady: false }), 'loading');
  assert.equal(classifyCloseAction({ ...ready, evidenceReady: false }), 'loading');
  assert.equal(classifyCloseAction({ ...ready, hasError: true }), 'error');
});

test('close screen routes missing-photo action to picker and hides action from non-assignee', () => {
  const ui = read('components/maintenance/progressive-work-order-close-queue.tsx');
  assert.match(ui, /classifyCloseAction\(/);
  assert.match(ui, /fluidClosureData\?\.canDeclare === true/);
  assert.match(ui, /ref=\{evidenceInputRef\}/);
  assert.match(ui, /entry\.evidence_type === 'photo'/);
  assert.match(ui, /closeAction === 'add_photo'/);
  assert.match(ui, /evidenceInputRef\.current\?\.click\(\)/);
  assert.match(ui, /closeAction !== 'view_only'/);
  assert.match(ui, /closeAction === 'add_photo' \|\| closeAction === 'ready'/);
  assert.match(ui, /Sólo el mecánico asignado confirma el cierre/);
  assert.match(ui, /setFluidUsedChoice/);
  assert.match(ui, /fluidWasteChoice/);
});

test('backend still requires assigned mechanic, photo and valid fluid declaration', () => {
  const route = read('app/api/maintenance/work-orders/[id]/close/route.ts');
  assert.match(route, /requireAssignedMaintenanceExecution/);
  assert.match(route, /isFluidClosureDeclarationCurrent/);
  assert.match(route, /evidence_type', 'photo'/);
  assert.match(route, /evidenceCount \|\| 0\) < 1/);
  assert.match(route, /close_work_order_safely/);
});
