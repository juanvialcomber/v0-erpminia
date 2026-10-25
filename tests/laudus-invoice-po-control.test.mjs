import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lib = fs.readFileSync('lib/integrations/laudus/invoice-po-control.ts','utf8');
const route = fs.readFileSync('app/api/integrations/laudus/invoice-po-control/route.ts','utf8');

test('invoice PO control is read-only, bounded and tenant scoped',()=>{
  assert.match(lib,/MAX_OPEN_INVOICES = 25/);
  assert.match(lib,/MAX_ORDER_HEADERS = 1000/);
  assert.match(lib,/QUERY_CHUNK = 50/);
  assert.match(lib,/eq\('organization_id', organizationId\)/);
  assert.match(lib,/candidateIsNotApproval: true/);
  assert.match(lib,/amountDeltaIsNotSavings: true/);
  assert.match(lib,/canonicalMutationExecuted: false/);
  assert.match(lib,/laudusMutationExecuted: false/);
  assert.doesNotMatch(lib,/\.insert\(/);
  assert.doesNotMatch(lib,/\.update\(/);
  assert.doesNotMatch(lib,/\.delete\(/);
});

test('invoice PO control requires Finance access',()=>{
  assert.match(route,/MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route,/loadLaudusInvoicePoControl/);
});

test('matcher requires exact supplier blocking and product evidence before scoring',()=>{
  assert.match(lib,/order\.supplier_external_id === invoice\.supplier_external_id/);
  assert.match(lib,/if \(!matchedProducts\) return null/);
  assert.match(lib,/coverageRatio \* 30/);
  assert.match(lib,/quantityMatchRatio \* 15/);
  assert.match(lib,/priceMatchRatio \* 15/);
});

test('strong confidence requires coverage, multiple products and candidate separation',()=>{
  assert.match(lib,/best\.metrics\.score >= 90/);
  assert.match(lib,/best\.metrics\.coverageRatio >= 0\.8/);
  assert.match(lib,/best\.metrics\.matchedProducts >= 2/);
  assert.match(lib,/gapToSecond === null \|\| gapToSecond >= 10/);
});


test('matcher refuses incompatible currencies and uses weighted aggregate price',()=>{
  assert.match(lib,/invoice\.currency\.toUpperCase\(\) === order\.currency\.toUpperCase\(\)/);
  assert.match(lib,/value\.lineTotal \/ value\.quantity/);
});

test('finance cockpit keeps deterministic PO matcher out of the interactive surface',()=>{
  const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
  assert.match(page,/Antes de pagar/);
  assert.match(page,/Evidencia de factura/);
  assert.doesNotMatch(page,/invoice-po-control/);
  assert.doesNotMatch(page,/OC candidata/);
});


test('candidate exposure is never summed across currencies',()=>{
  assert.match(lib,/amountsByCurrency/);
  assert.match(lib,/candidateExposureByCurrency/);
  assert.doesNotMatch(lib,/candidateExposure: candidates\.reduce/);
  const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
  assert.match(page,/candidateExposureByCurrency/);
  assert.match(page,/monedas/);
});


test('finance cockpit exposes missing source evidence honestly',()=>{
  const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
  assert.match(page,/Falta evidencia/);
  assert.match(page,/Detalle no disponible en la consulta actual/);
});
