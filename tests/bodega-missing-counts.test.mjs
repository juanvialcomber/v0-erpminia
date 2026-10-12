import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync('app/dashboard/bodega/page.tsx', 'utf8');
test('Bodega does not silently replace absent or failed counts with zero', () => {
  assert.match(page, /typeof value === 'number' && Number\.isFinite\(value\)/);
  assert.doesNotMatch(page, /Number\(value \|\| 0\)/);
  assert.match(page, /const overview = error \? \{\} :/);
  assert.match(page, /const positions: InventoryPosition\[\] = error \? \[\] :/);
  assert.match(page, /isLoading \|\| error \? '—' : number\(item\.value\)/);
});
