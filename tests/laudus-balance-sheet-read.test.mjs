import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/integrations/laudus/balance-sheet/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/integrations/laudus-balance-sheet-card.tsx', import.meta.url), 'utf8');
const finance = readFileSync(new URL('../app/dashboard/finanzas/page.tsx', import.meta.url), 'utf8');

test('Laudus balance sheet is finance-scoped, bounded and read-only', () => {
  assert.match(route, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route, /\/accounting\/balanceSheet\/8Columns/);
  assert.match(route, /allRows\.length > 5000/);
  assert.match(route, /slice\(0, 200\)/);
  assert.match(route, /persisted: false/);
  assert.match(route, /laudusMutated: false/);
  assert.match(route, /Cache-Control/);
});

test('Finance only queries Laudus balance on explicit user action', () => {
  assert.match(card, /enabled \? '\/api\/integrations\/laudus\/balance-sheet' : null/);
  assert.match(card, /Consultar balance/);
  assert.match(card, /evita sumar Activos, Pasivos, Gastos e Ingresos/);
  assert.match(card, /LaudusSourceMark/);
  assert.match(finance, /LaudusBalanceSheetCard/);
});
