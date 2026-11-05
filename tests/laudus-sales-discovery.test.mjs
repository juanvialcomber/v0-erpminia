import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/integrations/laudus/sales-discovery/route.ts','utf8');
const page = fs.readFileSync('app/dashboard/calidad-datos/reemplazo-laudus/page.tsx','utf8');

test('sales discovery is bounded, read only and non-persistent',()=>{
  assert.match(route,/sales\/customers\/list/);
  assert.match(route,/sales\/orders\/list/);
  assert.match(route,/limit: 5/);
  assert.match(route,/calls: 2/);
  assert.match(route,/persisted: false/);
  assert.match(route,/laudusMutationExecuted: false/);
  assert.match(route,/motilCanonicalMutationExecuted: false/);
  assert.doesNotMatch(route,/\.insert\(/);
  assert.doesNotMatch(route,/\.update\(/);
  assert.doesNotMatch(route,/\.upsert\(/);
});

test('replacement dashboard exposes explicit sales discovery action',()=>{
  assert.match(page,/sales-discovery/);
  assert.match(page,/Descubrir/);
  assert.match(page,/Clientes\/Ventas sí tiene uso en Laudus/);
});
