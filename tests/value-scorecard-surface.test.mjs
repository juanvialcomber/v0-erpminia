import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('finance cockpit separates Laudus exposure from canonical MOTIL payables', () => {
  const page = fs.readFileSync('app/dashboard/finanzas/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/finance/executive/route.ts', 'utf8');

  assert.match(api, /motil_laudus_finance_review_queue/);
  assert.match(page, /Saldo abierto/);
  assert.match(page, /Facturas aprobadas en MOTIL/);
  assert.match(page, /Estas facturas se gestionan en MOTIL\. Las facturas antiguas de Laudus se muestran por separado\./);
  assert.match(page, /Revisar ahora/);
  assert.doesNotMatch(page, /Preparado para nuevas fuentes/);
  assert.doesNotMatch(page, /Trazabilidad económica y SERNAGEOMIN/);
});

test('finance manager can reach value scorecard and its API', () => {
  const proxy = fs.readFileSync('proxy.ts', 'utf8');
  const sidebar = fs.readFileSync('components/layout/sidebar.tsx', 'utf8');
  const route = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

  assert.match(proxy, /path === '\/dashboard\/valor'/);
  assert.match(proxy, /path === '\/api\/value\/scorecard'/);
  assert.match(sidebar, /href: '\/dashboard\/valor'.*moduleKey: 'fin_finanzas'/);
  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.FIN_FINANZAS\)/);
});
