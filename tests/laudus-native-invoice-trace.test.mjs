import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const client = fs.readFileSync('lib/integrations/laudus/client.ts','utf8');
const lib = fs.readFileSync('lib/integrations/laudus/native-invoice-trace.ts','utf8');
const route = fs.readFileSync('app/api/integrations/laudus/native-invoice-trace/route.ts','utf8');
const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');

test('Laudus client exposes bounded read-only GET without arbitrary hosts',()=>{
  assert.match(client,/getLaudusReadOnly/);
  assert.match(client,/path\.startsWith\('\/purchases\/'\)/);
  assert.match(client,/method: 'GET'/);
  assert.doesNotMatch(client,/fetch\(path/);
});

test('native invoice trace is tightly bounded and non-persistent',()=>{
  assert.match(lib,/MAX_NATIVE_INVOICES = 5/);
  assert.match(lib,/MAX_NATIVE_CALLS = 10/);
  assert.match(lib,/persisted: false/);
  assert.match(lib,/canonicalMutationExecuted: false/);
  assert.match(lib,/laudusMutationExecuted: false/);
  assert.doesNotMatch(lib,/\.insert\(/);
  assert.doesNotMatch(lib,/\.update\(/);
  assert.doesNotMatch(lib,/\.delete\(/);
});

test('native trace confirms PO only by exact staged purchase order id',()=>{
  assert.match(lib,/ordersById\.get\(id\)/);
  assert.match(lib,/\.in\('external_id', ids\)/);
  assert.match(lib,/nativeTraceOverridesHeuristic: true/);
});

test('native trace does not interpret undocumented Laudus step codes',()=>{
  assert.doesNotMatch(lib,/fromStep ===/);
  assert.doesNotMatch(lib,/toStep ===/);
  assert.match(lib,/unclassifiedTraceCount/);
});

test('native trace API is Finance scoped and cached briefly',()=>{
  assert.match(route,/MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route,/private, max-age=300/);
});

test('finance presents native trace as primary evidence without calling it approval',()=>{
  assert.match(page,/Fuente nativa Laudus/);
  assert.match(page,/OC confirmada por trazabilidad Laudus/);
  assert.match(page,/Fuente primaria/);
  assert.match(page,/matcher determinístico como candidato, no como verdad fuente/);
});
