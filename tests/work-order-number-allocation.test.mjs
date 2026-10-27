import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/maintenance/work-orders/route.ts', import.meta.url), 'utf8');

test('OT numbering derives from the latest yearly sequence instead of row count', () => {
  assert.match(route, /const prefix = isEmergencyWork \? `OTE-\$\{year\}-` : `OT-\$\{year\}-`/);
  assert.match(route, /like\('work_order_number', `\$\{prefix\}%`\)/);
  assert.match(route, /order\('work_order_number', \{ ascending: false \}\)/);
  assert.doesNotMatch(route, /count:\s*'exact'/);
});

test('OT creation retries boundedly when the unique work-order number collides', () => {
  assert.match(route, /attempt < 3/);
  assert.match(route, /insertError\.code !== '23505'/);
  assert.match(route, /nextSequence \+= 1/);
  assert.match(route, /No se pudo reservar un número único/);
});
