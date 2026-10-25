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


test('maintenance recurrence is a post-close baseline and not causal attribution', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

  assert.match(api, /recurrence7d/);
  assert.match(api, /new work order on the same canonical asset within 7 days after closure/);
  assert.match(page, /Reincidencia a 7 días/);
  assert.match(page, /Baseline E2/);
  assert.match(page, /No implica que la OT anterior haya fallado/);
});

test('maintenance shortage handoff measures only a real human-confirmed procurement transition', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

  assert.match(api, /procurement_intake_created/);
  assert.match(api, /supply_need_refreshed/);
  assert.match(api, /human-confirmed handoff/);
  assert.match(page, /Shortage → solicitud operativa/);
  assert.match(page, /la creación de la solicitud sigue requiriendo acción humana/);
});


test('internal value page exposes weekly planning learning without calling it ROI', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx','utf8');
  assert.match(page, /Planificación semanal aprendiendo con uso real/);
  assert.match(page, /Aceptación planes MOTIL/);
  assert.match(page, /calibración L4, no impacto económico/);
  assert.match(page, /Mantención → Compras → recepción → instalación/);
  assert.match(page, /deuda de calidad de datos/);
});


test('internal value page exposes measured cross-domain cycle timing', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx','utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts','utf8');
  assert.match(api, /crossDomainCycle/);
  assert.match(api, /intakeToOrder/);
  assert.match(api, /orderToReceipt/);
  assert.match(api, /receiptToInstall/);
  assert.match(api, /empty stages are not estimated/);
  assert.match(page, /Solicitud → OC/);
  assert.match(page, /OC → recepción/);
  assert.match(page, /Recepción → instalación/);
  assert.match(page, /Sin muestra/);
});


test('internal maintenance value page shows L E C gates', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx','utf8');
  assert.match(page, /Gates L E C de Mantención/);
  assert.match(page, /L4 en calibración/);
  assert.match(page, /Cadena incompleta/);
});


test('maintenance value gates link to the workflow that produces the missing evidence', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx','utf8');
  assert.match(page, /Generar evidencia L/);
  assert.match(page, /Completar outcomes E/);
  assert.match(page, /Cerrar cadena C/);
  assert.match(page, /dashboard\/mantenimiento\/planificacion/);
  assert.match(page, /dashboard\/compras/);
});
