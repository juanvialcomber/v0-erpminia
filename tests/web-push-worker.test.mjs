import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function worker(windows = []) {
  const listeners = {};
  const calls = [];
  const self = {
    location: { origin: 'https://motil.example' },
    addEventListener(name, callback) { listeners[name] = callback; },
    registration: { async showNotification(title, options) { calls.push({ title, options }); } },
  };
  const clients = {
    async matchAll() { return windows; },
    async openWindow(url) { calls.push({ open: url }); },
  };
  vm.runInNewContext(readFileSync(new URL('../public/motil-sw-v2.js', import.meta.url), 'utf8'), { self, clients, URL, Set });
  return { listeners, calls };
}
test('Push requests a renewed, persistent alert without treating it as visible receipt', async () => {
  const { listeners, calls } = worker();
  let completion;
  listeners.push({ data: { json: () => ({ title: 'Pilot', body: 'Test', url: '/dashboard' }) }, waitUntil(p) { completion = p; } });
  await completion;
  assert.equal(calls[0].title, 'Pilot');
  assert.equal(calls[0].options.renotify, true);
  assert.equal(calls[0].options.requireInteraction, true);
  assert.equal(calls[0].options.data.url, '/dashboard');
});
test('Malformed Push payload does not display arbitrary content', () => {
  const { listeners, calls } = worker();
  listeners.push({ data: { json() { throw new Error('invalid JSON'); } }, waitUntil() {} });
  assert.equal(calls.length, 0);
});
test('Notification click focuses and navigates the existing MOTIL window', async () => {
  const windowCalls = [];
  const { listeners } = worker([{ url: 'https://motil.example/dashboard/tareas', async focus() { windowCalls.push('focus'); }, async navigate(url) { windowCalls.push(url); } }]);
  let completion;
  listeners.notificationclick({ notification: { data: { url: '/dashboard' }, close() {} }, waitUntil(p) { completion = p; } });
  await completion;
  assert.deepEqual(windowCalls, ['focus', 'https://motil.example/dashboard']);
});
test('Notification click opens MOTIL when no window exists and rejects external destinations', async () => {
  const { listeners, calls } = worker();
  let completion;
  listeners.notificationclick({ notification: { data: { url: '/dashboard' }, close() {} }, waitUntil(p) { completion = p; } });
  await completion;
  assert.equal(calls[0].open, 'https://motil.example/dashboard');
  listeners.notificationclick({ notification: { data: { url: 'https://other.example' }, close() {} }, waitUntil() { assert.fail('External navigation must not run'); } });
  assert.equal(calls.length, 1);
});
