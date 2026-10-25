import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('finance cockpit separates Laudus exposure from canonical MOTIL payables', () => {
  const page = fs.readFileSync('app/dashboard/finanzas/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/finance/executive/route.ts', 'utf8');

  assert.match(api, /motil_laudus_finance_review_queue/);
  assert.match(page, /Saldo abierto/);
  assert.match(page, /CxP aprobadas en MOTIL/);
  assert.match(page, /Las obligaciones históricas de Laudus se mantienen separadas de las CxP aprobadas en MOTIL/);
  assert.match(page, /Revisar ahora/);
  assert.doesNotMatch(page, /Preparado para nuevas fuentes/);
  assert.doesNotMatch(page, /Trazabilidad económica y SERNAGEOMIN/);
});

test('value scorecard stays internal and invisible to finance users', () => {
  const sidebar = fs.readFileSync('components/layout/sidebar.tsx', 'utf8');
  const route = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');
  const finance = fs.readFileSync('app/dashboard/finanzas/page.tsx', 'utf8');

  assert.match(sidebar, /href: '\/dashboard\/valor'.*group: 'admin'.*roles: \['superadmin','admin'\]/);
  assert.doesNotMatch(sidebar, /href: '\/dashboard\/valor'.*moduleKey: 'fin_finanzas'/);
  assert.doesNotMatch(finance, />Valor MOTIL</);
  assert.match(route, /const managementRoles = new Set\(\['superadmin', 'admin'\]\)/);
  assert.match(route, /return NextResponse\.json\(\{ error: 'No autorizado' \}, \{ status: 403 \}\)/);
});


test('internal value cockpit turns green only for demonstrated or sufficiently gated operational value', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

  assert.match(page, /Valor económico demostrado/);
  assert.match(page, /Reducción observada de tiempo/);
  assert.match(page, /Capacidad recuperada observada/);
  assert.match(page, /Monto bajo control financiero/);
  assert.match(page, /text-emerald-600/);
  assert.match(page, /Contexto, no ahorro/);
  assert.match(api, /reviewedAmountClp/);
  assert.match(api, /amount reviewed is value under human control, not savings or avoided cost/);
});
