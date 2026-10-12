import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../components/messages/motil-messages.tsx', import.meta.url), 'utf8');
test('outdated VAPID push subscription is safely recovered only after explicit activation', () => {
  assert.match(source, /const enablePush = async \(\) =>/);
  assert.match(source, /await subscription\.unsubscribe\(\)/);
  assert.match(source, /if \(!removed\) throw new Error\(t\.pushUnavailable\)/);
  assert.match(source, /subscription = null/);
  assert.match(source, /if \(!subscription\) \{\s*subscription = await registration\.pushManager\.subscribe/);
  assert.match(source, /onClick=\{\(\) => void enablePush\(\)\}/);
  assert.doesNotMatch(source, /Restablece la suscripción en la página de notificaciones/);
});
