import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const strip = fs.readFileSync('components/integrations/laudus-finance-status-strip.tsx','utf8');
const finance = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
const home = fs.readFileSync('components/dashboard/dashboard-home.tsx','utf8');

test('finance keeps Laudus visible but secondary to the MOTIL operating cockpit', () => {
  assert.match(finance, /MotilFinanceOperatingCockpit/);
  assert.ok(finance.indexOf('<MotilFinanceOperatingCockpit />') < finance.indexOf('<LaudusFinanceStatusStrip compact />'));
  assert.match(finance, /Fuente Laudus/);
  assert.match(finance, /LaudusFinanceStatusStrip/);
  assert.match(strip, /Laudus · fuente financiera/);
  assert.match(strip, /solo lectura/);
  assert.match(strip, /CxP/);
  assert.match(strip, /Pagos/);
  assert.match(strip, /Centros de costo/);
  assert.match(strip, /Activos fijos/);
});

test('Daniel home stays operational and does not require Laudus visibility', () => {
  assert.match(home, /personaKey/);
  assert.doesNotMatch(home, /LaudusFinanceStatusStrip/);
});

test('finance source status uses live finance-control evidence and freshness', () => {
  assert.match(strip, /\/api\/integrations\/laudus\/finance-control/);
  assert.match(strip, /latestOperationalSync/);
  assert.match(strip, /operationalSyncAgeDays/);
  assert.match(strip, /Laudus sigue siendo autoridad financiera/);
});
