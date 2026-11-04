import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/finance/operating-control/route.ts','utf8');
const cockpit = fs.readFileSync('components/finance/motil-finance-operating-cockpit.tsx','utf8');
const finance = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
const compras = fs.readFileSync('app/dashboard/compras/page.tsx','utf8');

test('MOTIL finance control derives the next decision from canonical operational workflow', () => {
  assert.match(route,/procurement_accounts_payable_v1/);
  assert.match(route,/procurement_supplier_payments/);
  assert.match(route,/procurement_match_exceptions/);
  assert.match(route,/procurement_supplier_invoices/);
  assert.match(route,/procurement_operational_orders/);
  assert.match(route,/procurement_operational_receipts/);
  assert.doesNotMatch(route,/schema\('integration'\)/);
});

test('MOTIL finance control preserves human and Laudus authority boundaries', () => {
  assert.match(route,/motil: 'operational_workflow'/);
  assert.match(route,/laudus: 'financial_tax_source_read_only'/);
  assert.match(route,/human: 'approval_and_payment_authority'/);
  assert.doesNotMatch(route,/\.insert\(/);
  assert.doesNotMatch(route,/\.update\(/);
  assert.doesNotMatch(route,/\.upsert\(/);
});

test('finance and procurement make Laudus secondary instead of operationally required', () => {
  assert.match(finance,/MotilFinanceOperatingCockpit/);
  assert.match(finance,/Fuente Laudus/);
  assert.match(finance,/Solo lectura · contraste financiero y tributario cuando haga falta/);
  assert.doesNotMatch(finance,/LaudusFinanceControlCard/);
  assert.match(compras,/Histórico y conciliación · no necesario para operar una compra nueva/);
  assert.match(compras,/Compras opera en MOTIL/);
  assert.match(compras,/Fuente no disponible; Compras MOTIL sigue operando/);
});

test('MOTIL finance cockpit exposes one next action and the full operational chain', () => {
  assert.match(cockpit,/Siguiente acción/);
  assert.match(cockpit,/Necesidad → OC → recepción → factura/);
  assert.match(cockpit,/Aprobación → vencimiento → pago → conciliación/);
  assert.match(cockpit,/Laudus queda como fuente financiera\/tributaria de contraste/);
});
