import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync('app/dashboard/compras/page.tsx', 'utf8');
const route = readFileSync('app/api/procurement/overview/route.ts', 'utf8');
test('Compras action label reflects verified edit access', () => {
  assert.match(route, /canEdit: access\.canWrite/);
  assert.match(page, /canEdit: boolean/);
  assert.match(page, /data\?\.canEdit === true \? 'Nueva compra' : 'Ver seguimiento'/);
});
test('Compras metrics do not display cached values when overview has failed', () => {
  assert.match(page, /isLoading \|\| error \|\| typeof value !== 'number'/);
  assert.match(page, /error \? '—' : data\?\.operational\.receipts/);
});
