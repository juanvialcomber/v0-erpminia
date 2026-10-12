import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setup({ displayFails = false, reportingFails = false } = {}) {
  const listeners = {};
  const reports = [];
  const displays = [];
  const opens = [];
  const self = {
    location: { origin: 'https://motil.example' },
    addEventListener(name, callback) { listeners[name] = callback; },
    registration: { async showNotification(title, options) {
      displays.push({ title, options });
      if (displayFails) throw new Error('notification blocked');
    } },
  };
  const clients = { async matchAll() { return []; }, async openWindow(url) { opens.push(url); } };
  const fetch = async (url, options) => {
    assert.equal(url, '/api/notifications/push/receipt');
    assert.equal(options.credentials, 'include');
    assert.equal(options.method, 'POST');
    reports.push(JSON.parse(options.body));
    if (reportingFails) throw new Error('offline');
    return { ok: true };
  };
  vm.runInNewContext(readFileSync(new URL('../public/motil-sw-v2.js', import.meta.url), 'utf8'), { self, clients, fetch, URL, Set, AbortSignal });
  return { listeners, reports, displays, opens };
}
const receipt = { testId: 'f01b0000-1234-4123-9123-000000000001', token: 'x'.repeat(43) };
async function push(context) {
  let done;
  context.listeners.push({ data: { json: () => ({ title: 'Pilot', body: 'Test', url: '/dashboard', receipt }) }, waitUntil(value) { done = value; } });
  await done;
}
test('browser reports decryptable receipt and successful notification creation separately', async () => {
  const c = setup();
  await push(c);
  assert.deepEqual(c.reports.map(r => r.stage).sort(), ['displayed', 'received']);
  assert.ok(c.reports.every(r => r.testId === receipt.testId && r.token === receipt.token));
  assert.equal(c.displays[0].options.renotify, true);
  assert.equal(c.displays[0].options.data.receipt.testId, receipt.testId);
});
test('reporting outage does not prevent a user-visible notification request', async () => {
  const c = setup({ reportingFails: true });
  await push(c);
  assert.equal(c.displays.length, 1);
  assert.ok(c.reports.some(r => r.stage === 'displayed'));
});
test('notification API rejection reports failure instead of creating a false displayed proof', async () => {
  const c = setup({ displayFails: true });
  await push(c);
  assert.deepEqual(c.reports.map(r => r.stage).sort(), ['display_failed', 'received']);
});
test('click receipt does not block same-origin MOTIL navigation', async () => {
  const c = setup({ reportingFails: true });
  let done;
  c.listeners.notificationclick({ notification: { data: { url: '/dashboard', receipt }, close() {} }, waitUntil(p) { done = p; } });
  await done;
  assert.deepEqual(c.opens, ['https://motil.example/dashboard']);
  assert.equal(c.reports[0].stage, 'clicked');
});
test('worker capability handshake does not disclose a receipt token', () => {
  const c = setup();
  const replies = [];
  c.listeners.message({ data: { type: 'GET_PUSH_PILOT_CAPABILITIES' }, ports: [{ postMessage(v) { replies.push(v); } }] });
  assert.equal(replies[0].receipts, true);
  assert.deepEqual(Object.keys(replies[0]), ['receipts']);
});
