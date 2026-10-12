import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync('app/dashboard/rrhh/operacion/page.tsx', 'utf8');
test('personnel capacity never conflates unavailable data with zero', () => {
  assert.match(page, /typeof value === 'number' && Number\.isFinite\(value\)/);
  assert.doesNotMatch(page, /Number\(value \|\| 0\)/);
  assert.match(page, /const overview = error \? \{\} :/);
  assert.match(page, /!isLoading && !error && !people\.length/);
});
