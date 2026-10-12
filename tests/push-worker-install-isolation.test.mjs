import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/motil-sw-v2.js', import.meta.url), 'utf8');

test('Push receiver installs even when offline cache is unavailable', async () => {
  const listeners = {};
  let skipCalled = false;
  const self = {
    location: { origin: 'https://motil.example' },
    addEventListener(type, callback) { listeners[type] = callback; },
    skipWaiting() { skipCalled = true; return Promise.resolve(); },
  };
  const caches = { open() { throw new Error('Offline asset cache unavailable'); } };
  vm.runInNewContext(source, { self, caches, Set, URL });
  let installPromise;
  listeners.install({ waitUntil(value) { installPromise = value; } });
  await installPromise;
  assert.equal(skipCalled, true);
  assert.equal(typeof listeners.push, 'function');
  assert.equal(typeof listeners.message, 'function');
});
