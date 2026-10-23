import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../lib/motil-ai/skills/action-policy.ts', import.meta.url), 'utf8');

test('MOTIL skills can explain and propose but cannot execute consequential operations autonomously', () => {
  for (const action of [
    'approve_purchase',
    'execute_payment',
    'execute_stock_transfer',
    'close_work_order',
    'apply_canonical_correction',
  ]) {
    assert.match(source, new RegExp("'" + action + "'"));
  }
  assert.match(source, /allowed: false/);
  assert.match(source, /Operational or financial execution is never an autonomous skill action/);
});

test('proposal actions require human confirmation', () => {
  assert.match(source, /requiresHumanConfirmation: true/);
  assert.match(source, /MOTIL may prepare a proposal but a human owns the operational decision/);
});
