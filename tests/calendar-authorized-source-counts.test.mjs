import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../app/api/calendar/operational/route.ts', import.meta.url), 'utf8');

test('calendar summary counts only authorized visible sources', () => {
  for (const key of ['maintenance','hse','legal','procurement','finance','people']) {
    assert.match(source, new RegExp(`${key}: visibleItems\\.filter\\(\\(item\\) => item\\.source === '${key}'\\)\\.length`));
  }
  assert.doesNotMatch(source, /hse: items\.filter/);
  assert.doesNotMatch(source, /legal: items\.filter/);
  assert.doesNotMatch(source, /procurement: items\.filter/);
  assert.doesNotMatch(source, /finance: items\.filter/);
  assert.doesNotMatch(source, /people: items\.filter/);
});
