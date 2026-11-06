import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const inbox = readFileSync('app/api/legal/inbox/route.ts', 'utf8');
const control = readFileSync('app/api/legal/contract-control/route.ts', 'utf8');
const page = readFileSync('app/dashboard/legal/control-contractual/page.tsx', 'utf8');

test('legal inbox surfaces polvorin renewal alerts from canonical compliance events', () => {
  assert.match(inbox, /from\('compliance_events'\)/);
  assert.match(inbox, /\[POLVORIN\]/);
  assert.match(inbox, /Aviso preventivo 15 días antes/);
  assert.match(inbox, /source_href: '\/dashboard\/legal\/permisos-licencias'/);
});

test('contract control keeps billing separate from physical execution', () => {
  assert.match(control, /billingState/);
  assert.match(control, /pendingAmount/);
  assert.match(control, /executionPercentage/);
  assert.match(control, /timelineState/);
  assert.match(control, /daysUntilEnd <= 15/);
});

test('contract traffic-light policy does not infer green from missing data', () => {
  assert.match(control, /verde sólo se usa cuando existe evidencia suficiente/i);
  assert.match(control, /No existe avance físico informado/);
});


test('contract control UI separates billing, balance and physical progress', () => {
  assert.match(page, /Facturado \/ pagado/);
  assert.match(page, /Saldo/);
  assert.match(page, /Facturación %/);
  assert.match(page, /Avance físico/);
  assert.match(page, /Plazo vencido/);
});
