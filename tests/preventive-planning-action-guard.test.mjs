import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../components/maintenance/preventive-plan-board.tsx', import.meta.url), 'utf8');
test('preventive plan actions are guarded against rapid duplicate requests', () => {
  assert.match(source, /if \(actionInFlight\.current\) return/);
  assert.match(source, /actionInFlight\.current = true/);
  assert.match(source, /finally\s*\{\s*actionInFlight\.current = false;\s*setPendingAction\(null\)/);
  assert.match(source, /disabled=\{pendingAction !== null \|\| !schedule\.enabled \|\| Boolean\(schedule\.generated_work_order_id\)\}/);
  assert.match(source, /disabled=\{pendingAction !== null\} onClick=\{\(\) => void act\(schedule\.id, 'toggle'\)\}/);
});
