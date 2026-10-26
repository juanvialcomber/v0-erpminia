import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/integrations/laudus/finance-control/route.ts','utf8');
const loader = fs.readFileSync('lib/integrations/laudus/finance-control.ts','utf8');
const card = fs.readFileSync('components/integrations/laudus-finance-control-card.tsx','utf8');
const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');

test('Daniel Laudus control is finance scoped and read only', () => {
  assert.match(route, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(loader, /readOnly: true/);
  assert.match(loader, /motilDoesNotWriteLaudus: true/);
  assert.match(card, /Solo lectura/);
});

test('finance control separates current operational data from historical accounting', () => {
  assert.match(loader, /currentEnoughForExecutiveUse/);
  assert.match(loader, /historical accounting rows are not presented as current balances/);
  assert.match(card, /Histórica\. Último asiento/);
});

test('credit notes and reconciliation gaps keep conservative semantics', () => {
  assert.match(loader, /not savings or recovered cash/);
  assert.match(card, /Documentadas · no es ahorro/);
  assert.match(card, /Centros por conciliar/);
  assert.match(card, /No se usarán para atribución ejecutiva hasta resolverlos/);
});

test('Daniel finance workspace surfaces the Laudus control block', () => {
  assert.match(page, /LaudusFinanceControlCard/);
  assert.match(page, /<LaudusFinanceControlCard \/>/);
  assert.match(card, /Laudus · fuente financiera/);
  assert.match(card, /Pagos por verificar/);
});


test('pending Laudus payments are shown as source-state cases, not inferred debt', () => {
  assert.match(loader, /pendingItems/);
  assert.match(card, /estado “no depositado” en Laudus/);
  assert.match(card, /MOTIL no lo interpreta automáticamente como deuda, error bancario ni pago pendiente/);
  assert.match(card, /Monto no informado/);
});


test('finance summary stays neutral and does not overclaim urgency', () => {
  assert.match(page, /Resumen financiero/);
  assert.match(page, /Exposición, decisiones y evidencia/);
  assert.doesNotMatch(page, /Sin decisiones urgentes en la muestra actual/);
});


test('Laudus payables control is bounded and keeps source-state semantics', () => {
  assert.match(loader, /laudus_accounts_payable_service_v1/);
  assert.match(loader, /oldestOpenItems/);
  assert.match(loader, /not reconciled cash commitment or final accounting liability/);
  assert.match(card, /CxP más antiguas/);
  assert.match(card, /Ordenado por vencimiento más antiguo/);
  assert.match(card, /MOTIL no trata estos saldos como caja comprometida definitiva sin conciliación/);
});


test('Daniel finance control uses evidence-backed visual analytics instead of fabricated history', () => {
  assert.match(loader, /historicalTrendAvailable: false/);
  assert.match(loader, /aging: Array\.from\(agingMap\.values\(\)\)/);
  assert.match(loader, /dueByMonth/);
  assert.match(loader, /topSuppliers/);
  assert.match(card, /Aging de CxP abierta/);
  assert.match(card, /Vencimientos abiertos por mes/);
  assert.match(card, /Concentración por proveedor/);
  assert.match(card, /No es una serie histórica de saldo/);
  assert.match(card, /MOTIL no la simula/);
});

test('decision-first finance visuals expose observable change, risk and source freshness', () => {
  assert.match(card, /Cambios observables · 7 días/);
  assert.match(card, /entraron en mora/);
  assert.match(card, /Exposición abierta/);
  assert.match(card, /Riesgo/);
  assert.match(card, /Explicación/);
  assert.match(card, /Laudus ·/);
  assert.match(card, /Concentración no implica causalidad/);
  assert.match(card, /Aún no existe una serie diaria histórica comparable de saldo/);
});


test('MOTIL explanation stays factual and non-causal', () => {
  assert.match(loader, /severeAgingSharePct/);
  assert.match(loader, /topSupplierSharePct/);
  assert.match(card, /Lectura MOTIL/);
  assert.match(card, /No implican causalidad, prioridad de pago ni riesgo financiero definitivo/);
});


test('Laudus date-only values preserve Santiago calendar semantics', () => {
  assert.match(loader, /function santiagoDateKey/);
  assert.match(loader, /function sourceDateKey/);
  assert.match(loader, /todayEpochDay/);
  assert.match(loader, /dateKeyToEpochDay/);
  assert.match(card, /T12:00:00-03:00/);
});


test('Daniel receives a bounded daily priority queue before secondary analytics', () => {
  assert.match(card, /Qué debe resolver Daniel primero/);
  assert.match(card, /slice\(0, 3\)/);
  assert.match(card, /Revisar CxP vencida/);
  assert.match(card, /Preparar vencimientos de 7 días/);
  assert.match(card, /Cerrar atribución por centro de costo/);
  assert.match(card, /Sin decisiones financieras urgentes detectadas/);
});


test('Daniel priority queue can surface supplier concentration without inferring causality', () => {
  assert.match(card, /Revisar concentración por proveedor/);
  assert.match(card, /topSupplierSharePct >= 15/);
  assert.match(card, /del saldo abierto/);
});


test('Daniel cockpit follows MOTIL decision-first visual hierarchy', () => {
  assert.match(card, /Resumen financiero ejecutivo/);
  assert.match(card, /Exposición abierta/);
  assert.match(card, /Qué debe resolver Daniel primero/);
  assert.match(card, /por resolver/);
  assert.match(card, /Cobertura financiera/);
});


test('Daniel cockpit exposes actionable queues without claiming automatic closure', () => {
  assert.match(card, /Listo para trabajar hoy/);
  assert.match(card, /Pagos por verificar/);
  assert.match(card, /Centros por conciliar/);
  assert.match(card, /Son colas accionables, no cierres automáticos/);
});


test('secondary evidence stays collapsed and does not compete with the daily decision', () => {
  assert.match(card, /Evidencia y brechas/);
  assert.match(card, /Cerrado por defecto/);
  assert.match(card, /<details className="group">/);
  assert.match(card, /Cobertura de evidencia/);
});


test('secondary analytics stay collapsed so decisions remain visually dominant', () => {
  assert.match(card, /Análisis adicional/);
  assert.match(card, /Aging, vencimientos y concentración por proveedor/);
  assert.match(card, /group-open:hidden/);
});
