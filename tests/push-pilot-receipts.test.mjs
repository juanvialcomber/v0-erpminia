import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source = readFileSync(new URL('../lib/notifications/pilot-receipts.ts', import.meta.url), 'utf8');
const { createPilotReceipt, validPilotReceipt, authenticPilotReceipt, pilotReceiptPatch, PILOT_RECEIPT_WINDOW_MS } =
  await import('data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64'));

test('receipt proof is random, hashed, current and not forgeable from a test identifier', () => {
  const receipt = createPilotReceipt();
  const other = createPilotReceipt();
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  assert.ok(validPilotReceipt({ testId: receipt.testId, token: receipt.token, stage: 'received' }));
  assert.ok(authenticPilotReceipt(receipt.token, receipt.tokenHash, timestamp, now));
  assert.equal(authenticPilotReceipt(other.token, receipt.tokenHash, timestamp, now), false);
  assert.equal(authenticPilotReceipt(receipt.token, receipt.tokenHash, timestamp, now + PILOT_RECEIPT_WINDOW_MS + 1), false);
  assert.equal(authenticPilotReceipt(receipt.token, receipt.tokenHash, timestamp, now - 1), false);
  assert.notEqual(receipt.testId, other.testId);
  assert.notEqual(receipt.token, other.token);
});
test('receipt rejects malformed tokens and unknown state claims', () => {
  const r = createPilotReceipt();
  assert.equal(validPilotReceipt({ testId: r.testId, token: r.token, stage: 'visible' }), false);
  assert.equal(validPilotReceipt({ testId: r.testId, token: '', stage: 'received' }), false);
  assert.equal(validPilotReceipt({ testId: 'anything', token: r.token, stage: 'received' }), false);
  assert.equal(authenticPilotReceipt(r.token, 'invalid', new Date().toISOString()), false);
});
test('display and click evidence never invent physical visibility or overwrite receipt state', () => {
  assert.deepEqual(pilotReceiptPatch('received', 't'), { last_test_received_at: 't' });
  assert.deepEqual(pilotReceiptPatch('displayed', 't'), { last_test_displayed_at: 't', last_test_display_error: null });
  assert.deepEqual(pilotReceiptPatch('clicked', 't'), { last_test_clicked_at: 't' });
  assert.deepEqual(pilotReceiptPatch('display_failed', 't'), { last_test_display_error: 'notification_api_failed' });
});
