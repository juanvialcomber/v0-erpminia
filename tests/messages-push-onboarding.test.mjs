import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const component = readFileSync(new URL('../components/messages/motil-messages.tsx', import.meta.url), 'utf8');
test('Push enrollment remains optional and reloads server device status after registration', () => {
  assert.match(component, /pushHint: 'Los mensajes llegan dentro de MOTIL/);
  assert.match(component, /inbox \? '\/api\/notifications\/push' : null/);
  assert.match(component, /await postJson\('\/api\/notifications\/push', subscription\.toJSON\(\)\)/);
  assert.match(component, /await reloadPushInfo\(\)/);
  assert.match(component, /pushInfo\.devices === 0/);
  assert.match(component, /onClick=\{\(\) => void enablePush\(\)\}/);
  assert.doesNotMatch(component, /useEffect\(\(\) => \{\s*void enablePush\(\)/);
});
