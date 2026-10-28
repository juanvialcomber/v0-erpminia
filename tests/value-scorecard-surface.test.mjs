import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('finance cockpit separates Laudus exposure from canonical MOTIL payables', () => {
  const page = fs.readFileSync('app/dashboard/finanzas/page.tsx', 'utf8');
  const card = fs.readFileSync('components/integrations/laudus-finance-control-card.tsx', 'utf8');
  const api = fs.readFileSync('app/api/finance/executive/route.ts', 'utf8');

  assert.match(api, /motil_laudus_finance_review_queue/);
  assert.match(card, /Exposición abierta/);
  assert.match(card, /Qué debe resolver Daniel primero/);
  assert.match(page, /Pagos.*Proveedores.*Centros de costos.*Trazabilidad/s);
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


test('maintenance value cockpit publishes evidence coverage with explicit numerator semantics and no ROI claim', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

  assert.match(api, /assignmentCoverage/);
  assert.match(api, /assetCoverage/);
  assert.match(api, /rootCauseCoverage/);
  assert.match(api, /preventiveActionCoverage/);
  assert.match(api, /meterCoverage/);
  assert.match(api, /attribution: 'NO_MEDIBLE_AUN'/);
  assert.match(api, /pricingReadiness: 'MARKET_ANCHORED'/);
  assert.match(api, /Minutos administrativos por OT antes de MOTIL versus con MOTIL/);
  assert.match(api, /\.not\('created_by', 'is', null\)/);
  assert.match(page, /Cobertura · calidad de evidencia/);
  assert.match(page, /Numerador y universo real/);
  assert.match(page, /Cobertura no significa ahorro ni mejora causal/);
  assert.match(page, /Gate de valor/);
});


test('maintenance administrative baseline is isolated from mechanical execution and admin-only value evidence', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const route = fs.readFileSync('app/api/value/maintenance-baseline/route.ts', 'utf8');

  assert.match(route, /maintenance_admin_manual_baseline/);
  assert.match(route, /manual OT opening and initial assignment measured outside MOTIL assistance; excludes mechanical execution, waiting, later updates and closure/);
  assert.match(route, /const managementRoles = new Set\(\['superadmin', 'admin'\]\)/);
  assert.match(route, /seconds_per_case/);
  assert.match(page, /Baseline manual de apertura de OT/);
  assert.match(page, /No incluye reparación, espera, actualizaciones posteriores ni cierre/);
  assert.match(page, /Gate inicial: ≥3 muestras manuales comparables/);
});


test('maintenance assisted creation timing is comparable only after matched-scope sample gates', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');
  const create = fs.readFileSync('components/maintenance/create-work-order.tsx', 'utf8');
  const route = fs.readFileSync('app/api/maintenance/work-orders/route.ts', 'utf8');

  assert.match(create, /X-Motil-Admin-Interaction-Ms/);
  assert.match(route, /maintenance_ot_create_interaction/);
  assert.match(route, /excludes mechanical execution and waiting/);
  assert.match(api, /maintenanceCreateTimingValues/);
  assert.match(api, /medianCreateSeconds/);
  assert.match(page, /maintenanceManualSamples >= 3/);
  assert.match(page, /maintenanceAssistedSamples >= 10/);
  assert.match(page, /Reducción observada del tiempo de apertura y asignación/);
  assert.match(page, /Puede ser negativa si MOTIL demora más/);
});


test('OTe value cohort measures only observed event-chain intervals through human approval', () => {
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');
  const api = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

  assert.match(api, /emergency_detected/);
  assert.match(api, /work_order_supervisor_reviews/);
  assert.match(api, /status === 'approved'/);
  assert.match(api, /detectedToRegistered/);
  assert.match(api, /registeredToStart/);
  assert.match(api, /startToClose/);
  assert.match(api, /closeToApproval/);
  assert.match(api, /endToEnd/);
  assert.match(api, /missing timestamps remain unmeasured/);
  assert.match(page, /OTe · cohorte de emergencia/);
  assert.match(page, /Detección → aprobación/);
  assert.match(page, /Un tramo sin timestamp queda sin medir/);
  assert.match(page, /MOTIL no la infiere desde la creación/);
});


test('maintenance close timing is measured separately from mechanical execution', () => {
  const closeFlow = fs.readFileSync('components/maintenance/progressive-work-order-close-queue.tsx', 'utf8');
  const closeRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/close/route.ts', 'utf8');
  const scorecard = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');

  assert.match(closeFlow, /X-Motil-Close-Interaction-Ms/);
  assert.match(closeRoute, /maintenance_ot_close_interaction/);
  assert.match(closeRoute, /excludes mechanical execution and waiting outside the flow/);
  assert.match(scorecard, /maintenanceCloseTimingValues/);
  assert.match(scorecard, /medianCloseSeconds/);
  assert.match(page, /Baseline manual de cierre de OT/);
  assert.match(page, /Reducción observada del tiempo de cierre/);
  assert.match(page, /≥3 muestras manuales y ≥10 cierres MOTIL instrumentados/);
});

test('maintenance LEC publishes coverage from complete closed-OT evidence only', () => {
  const scorecard = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');

  assert.match(scorecard, /traceCompleteClosedRows/);
  assert.match(scorecard, /execution_evidence_added/);
  assert.match(scorecard, /supervisor approval/);
  assert.match(scorecard, /coverageLevel/);
  assert.match(scorecard, /coverageNumerator/);
  assert.match(scorecard, /coverageDenominator/);
  assert.match(scorecard, /valueLevel/);
  assert.match(page, /LEC Mantención/);
  assert.match(page, /Cobertura completa/);
});

test('maintenance manual baseline supports a separate close phase', () => {
  const route = fs.readFileSync('app/api/value/maintenance-baseline/route.ts', 'utf8');

  assert.match(route, /phase.*=== 'close'/);
  assert.match(route, /maintenance_admin_manual_close_baseline/);
  assert.match(route, /maintenance-close-baseline-v1/);
  assert.match(route, /manual OT administrative closure measured outside MOTIL assistance/);
});
