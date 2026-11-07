import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const strip = fs.readFileSync('components/integrations/laudus-finance-status-strip.tsx','utf8');
const finance = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
const home = fs.readFileSync('components/dashboard/dashboard-home.tsx','utf8');

test('finance exposes a healthy financial source without making ERP branding the workflow', () => {
  assert.match(finance, /LaudusFinanceStatusStrip/);
  assert.match(strip, /Fuente financiera/);
  assert.match(strip, /solo lectura/);
  assert.match(strip, /CxP/);
  assert.match(strip, /Pagos/);
  assert.match(strip, /Centros de costo/);
  assert.match(strip, /Activos fijos/);
  assert.doesNotMatch(strip, /Laudus · fuente financiera/);
});

test('Daniel home shows the finance source connection through the existing status component', () => {
  assert.match(home, /personaKey === 'daniel_finance'/);
  assert.match(home, /LaudusFinanceStatusStrip compact/);
});

test('finance source status uses live finance-control evidence and freshness', () => {
  assert.match(strip, /\/api\/integrations\/laudus\/finance-control/);
  assert.match(strip, /latestOperationalSync/);
  assert.match(strip, /operationalSyncAgeDays/);
  assert.match(strip, /La fuente contable conserva la autoridad/);
});
