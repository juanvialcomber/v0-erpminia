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


test('maintenance internal value is evidence-based and never equates traced execution with savings', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

  assert.match(api, /maintenance_work_orders/);
  assert.match(api, /work_order_events/);
  assert.match(api, /maintenanceValue/);
  assert.match(api, /observed maintenance execution and traceability; not saved time, avoided downtime, or economic ROI/);
  assert.match(page, /Mantención · evidencia operacional/);
  assert.match(page, /Horas de ejecución observadas/);
  assert.match(page, /no se interpreta como horas ahorradas/);
  assert.match(page, /L4 significa flujo instrumentado con decisión humana; E2, desempeño medido/);
});


test('maintenance cross-domain coverage counts only domains with real evidence', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

  assert.match(api, /work_order_supply_chain_v1/);
  assert.match(api, /connectedDomains/);
  assert.match(api, /withProcurementRequests/);
  assert.match(api, /withPurchaseOrders/);
  assert.match(page, /Cobertura inter-área/);
  assert.match(page, /Mantención → Bodega → Compras → Finanzas/);
  assert.match(page, /Sólo cuenta un dominio cuando existe un evento real/);
});


test('maintenance execution-cycle metric is explicit and not mislabeled as savings', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

  assert.match(api, /medianExecutionCycleSeconds/);
  assert.match(api, /first timer start to work-order closure/);
  assert.match(page, /Ciclo ejecución → cierre/);
  assert.match(page, /Mediana de/);
  assert.doesNotMatch(page, /horas ahorradas por mantención/i);
});
