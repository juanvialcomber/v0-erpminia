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

test('native trace stays on public service facade and never reads private integration schema',()=>{
  assert.match(lib,/laudus_purchase_invoice_payment_status_service_v1/);
  assert.doesNotMatch(lib,/\.schema\('integration'\)/);
  assert.doesNotMatch(lib,/laudus_purchase_orders/);
  assert.match(lib,/sourceTraceIsNotPurchaseOrderConfirmation: true/);
});

test('native trace does not interpret undocumented Laudus step codes',()=>{
  assert.doesNotMatch(lib,/fromStep ===/);
  assert.doesNotMatch(lib,/toStep ===/);
  assert.match(lib,/sourceTraceTypeUnclassified: true/);
});

test('native trace API is Finance scoped and cached briefly',()=>{
  assert.match(route,/MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route,/private, max-age=300/);
});

test('finance presents native Laudus evidence without overclaiming PO confirmation',()=>{
  assert.match(page,/Información de las facturas/);
  assert.match(page,/Con detalle/);
  assert.match(page,/Con documentos relacionados/);
  assert.match(page,/Hay documentos relacionados en Laudus/);
  assert.match(page,/Laudus no entregó el detalle de los conceptos/);
  assert.match(page,/Que exista un documento relacionado no significa que la compra o el pago estén aprobados/);
  assert.doesNotMatch(page,/OC confirmada/);
});
