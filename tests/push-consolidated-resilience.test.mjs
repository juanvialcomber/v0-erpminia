import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const worker = readFileSync(new URL('../public/motil-sw-v2.js', import.meta.url), 'utf8');
function setup({ brokenCache = false, missingTimeout = false, throwingTelemetry = false } = {}) {
  const listeners = {}, displays = [];
  const self = {
    location: { origin: 'https://motil.example' },
    addEventListener(type, callback) { listeners[type] = callback; },
    clients: { async claim() {} },
    async skipWaiting() {},
    registration: { async showNotification(title, options) { displays.push({ title, options }); } },
  };
  const caches = { async keys() { if (brokenCache) throw Error('blocked cache'); return []; }, async delete() {} };
  const signal = missingTimeout ? {} : AbortSignal;
  const fetch = () => { if (throwingTelemetry) throw Error('telemetry not available'); return Promise.resolve({ ok: true }); };
  vm.runInNewContext(worker, { self, caches, fetch, URL, Set, AbortSignal: signal, clients: self.clients });
  return { listeners, displays };
}
test('broken cache does not prevent worker activation', async () => {
  const c = setup({ brokenCache: true });
  let done;
  c.listeners.activate({ waitUntil(p) { done = p; } });
  await assert.doesNotReject(done);
});
test('synchronous telemetry errors and missing AbortSignal.timeout do not suppress chat push', async () => {
  const c = setup({ missingTimeout: true, throwingTelemetry: true });
  let done;
  const receipt = { testId: 'f01b0000-1234-4123-9123-000000000001', token: 'x'.repeat(43) };
  c.listeners.push({
    data: { json: () => ({ title: 'MOTIL', body: 'Nuevo mensaje', url: '/dashboard/mensajes', tag: 'motil-msg-f01b0000-1234-4123-9123-000000000001', receipt }) },
    waitUntil(p) { done = p; },
  });
  await assert.doesNotReject(done);
  assert.equal(c.displays.length, 1);
  assert.equal(c.displays[0].options.tag, 'motil-msg-f01b0000-1234-4123-9123-000000000001');
  assert.equal(c.displays[0].options.icon, '/icon-512.png');
});
