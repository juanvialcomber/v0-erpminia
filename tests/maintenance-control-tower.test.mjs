import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const api = await readFile(new URL('../app/api/maintenance/control-tower/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../components/maintenance/control-tower-screen.tsx', import.meta.url), 'utf8');
const monitor = await readFile(new URL('../app/monitor/mantenimiento/page.tsx', import.meta.url), 'utf8');

test('control tower is read-only and tenant-scoped', () => {
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.doesNotMatch(api, /export async function POST/);
  assert.match(api, /eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /mode: 'read_only'/);
});

test('live wallboard master assembles canonical state and evidence without a second DB master', () => {
  assert.match(api, /maintenance_canonical_assets_v1/);
  assert.match(api, /planning_maintenance_priority_v1/);
  assert.match(api, /motil_email_equipment_meter_stage/);
  assert.match(api, /motil_whatsapp_asset_360_latest_v1/);
  assert.match(api, /maintenance_asset_status_history/);
  assert.match(api, /maintenance_work_orders/);
  assert.doesNotMatch(api, /motil_maintenance_live_master_v1/);
});

test('control tower applies freshness and excludes stale planning recommendations', () => {
  assert.match(api, /operationalCutoff/);
  assert.match(api, /planningCurrent/);
  assert.match(api, /operationalCutoff/);
  assert.match(api, /sameOrAfter\(planningAt\?\.slice\(0, 10\) \|\| null, operationalCutoff\)/);
  assert.match(api, /activeRecommendation = planningCurrent/);
  assert.match(api, /stalePlanningAssets/);
  assert.match(api, /planningPriority: planningCurrent \?/);
  assert.match(api, /partsPending =\n        \(planningCurrent && isPartsPending/);
});

test('control tower includes email and whatsapp freshness plus unresolved email evidence', () => {
  assert.match(api, /motil_email_source_manifest/);
  assert.match(api, /eq\('domain', 'maintenance'\)/);
  assert.match(api, /motil_whatsapp_message_registry_v1/);
  assert.match(api, /pendingEmailMatches/);
  assert.match(page, /Entradas por revisar/);
  assert.match(page, /Correo mantención/);
  assert.match(page, /WhatsApp/);
});

test('wallboard rotates six operational views every thirty seconds and refreshes data independently', () => {
  assert.match(page, /Análisis operacional/);
  assert.match(page, /Equipos detenidos/);
  assert.match(page, /Mantenciones preventivas/);
  assert.match(page, /Programación de trabajos/);
  assert.match(page, /Control general de flota/);
  assert.match(page, /Indicadores de gestión/);
  assert.match(page, /const rotationMs = 30_000/);
  assert.match(page, /refreshInterval: 60_000/);
  assert.match(api, /rotationSeconds: 30/);
});

test('wallboard remains informational only', () => {
  assert.match(page, /Solo lectura/);
  assert.doesNotMatch(page, /onClick=/);
  assert.doesNotMatch(page, /<Button/);
  assert.doesNotMatch(page, /<Input/);
  assert.doesNotMatch(page, /<Select/);
  assert.doesNotMatch(page, /<form/);
});

test('wallboard preserves missing KPI truth instead of inventing availability', () => {
  assert.match(api, /availabilityPct: null/);
  assert.match(api, /Sin base canónica de disponibilidad diaria/);
  assert.doesNotMatch(page, /Disponibilidad operacional/);
  assert.match(page, /Sólo métricas con información suficiente/);
});

test('standalone maintenance monitor keeps authentication but removes dashboard chrome', () => {
  assert.match(monitor, /cookies\(\)/);
  assert.match(monitor, /auth_token/);
  assert.match(monitor, /redirect\('\/login\?next=\/monitor\/mantenimiento'\)/);
  assert.match(monitor, /MaintenanceControlTowerPage/);
  assert.doesNotMatch(monitor, /DashboardShell/);
});

test('reduced motion keeps the timed wallboard loop but removes slide animation only', () => {
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(page, /window\.setInterval/);
  assert.match(page, /!reduceMotion && 'animate-in fade-in duration-300'/);
});


test('wallboard separates canonical fleet from live operational coverage', () => {
  assert.match(api, /emailCurrent/);
  assert.match(api, /whatsappCurrent/);
  assert.match(api, /currentCoverage/);
  assert.match(api, /const currentRows = rows\.filter\(\(row\) => row\.currentCoverage\)/);
  assert.match(api, /canonicalAssets: rows\.length/);
  assert.match(api, /activeAssets: currentRows\.length/);
  assert.match(api, /rows: currentRows/);
});

test('stale email and whatsapp evidence cannot activate stopped or parts-pending state', () => {
  assert.match(api, /emailCurrent && isStoppedSignal/);
  assert.match(api, /whatsappCurrent && isStoppedSignal/);
  assert.match(api, /emailCurrent && isPartsPending/);
  assert.match(api, /whatsappCurrent && isPartsPending/);
});


test('wallboard shows live coverage against the canonical fleet', () => {
  assert.match(page, /equipos con señal actual/);
  assert.match(page, /summary\?\.activeAssets/);
  assert.match(page, /summary\?\.canonicalAssets/);
});


test('wallboard reads maintenance WhatsApp from Grupo 2 live registry and separates input from published asset evidence', () => {
  assert.match(api, /motil_whatsapp_message_registry_v1/);
  assert.match(api, /eq\('group_name', 'Grupo 2'\)/);
  assert.match(api, /pendingWhatsAppInputs/);
  assert.match(api, /latestPublishedWhatsappAt/);
  assert.match(page, /WhatsApp vinculado/);
  assert.match(page, /Señales recientes/);
});

test('wallboard intake metric combines current unresolved email and WhatsApp inputs without canonical promotion', () => {
  assert.match(api, /pendingEmailMatches/);
  assert.match(api, /pendingWhatsAppInputs/);
  assert.match(page, /Entradas por revisar/);
  assert.doesNotMatch(api, /update\(['"]maintenance_work_orders/);
});


test('wallboard is planning-centered for Ariel coordination role', () => {
  assert.match(api, /role: 'planning_coordination'/);
  assert.match(api, /dueTodayOpenWorkOrders/);
  assert.match(api, /dueTomorrowOpenWorkOrders/);
  assert.match(api, /unassignedOpenWorkOrders/);
  assert.match(api, /byAssignee: assigneeCoordination/);
  assert.match(page, /Prioridades activas/);
  assert.match(page, /Programa de ejecución/);
  assert.match(page, /Coordinación del equipo/);
});

test('schedule horizon uses Santiago local day and keeps overdue today tomorrow distinct', () => {
  assert.match(api, /timeZone: 'America\/Santiago'/);
  assert.match(api, /const today = santiagoDay\(\)/);
  assert.match(api, /const tomorrow = santiagoDay\(1\)/);
  assert.match(page, /Para hoy/);
  assert.match(page, /Para mañana/);
});


test('wallboard exposes bodega evidence without treating missing evidence as covered stock', () => {
  assert.match(api, /work_order_supply_chain_v1/);
  assert.match(api, /openOrdersWithoutSupplyEvidence/);
  assert.match(api, /openOrdersWithShortage/);
  assert.match(api, /supplyStatus/);
  assert.match(page, /reservas de Bodega por separado/);
  assert.match(page, /Preparación/);
  assert.match(api, /Materiales no declarados/);
  assert.match(api, /Stock por confirmar/);
  assert.match(api, /Bloqueada por faltante/);
  assert.match(api, /En compra/);
});


test('wallboard distinguishes OT lifecycle stages from schedule urgency', () => {
  assert.match(api, /work_order_evidence_files/);
  assert.match(api, /work_order_supervisor_reviews/);
  assert.match(api, /lifecycleStage/);
  assert.match(api, /Revisada/);
  assert.match(api, /Evidenciada/);
  assert.match(api, /En ejecución/);
  assert.match(page, /Etapa/);
  assert.match(page, /Vencida ·/);
  assert.match(page, /Mañana ·/);
});

test('preventive slide separates hour and kilometer bases and reports active schedule coverage', () => {
  assert.match(api, /preventive_maintenance_schedules/);
  assert.match(api, /preventiveBasis/);
  assert.match(api, /approvedPreventiveSchedules/);
  assert.match(page, /Horas/);
  assert.match(page, /Kilómetros/);
  assert.match(page, /Anual/);
  assert.match(api, /acc\.annual/);
  assert.match(page, /Plan preventivo vigente/);
});

test('fleet slide shows source coverage and freshness by site', () => {
  assert.match(page, /Correo \{site\.email\}/);
  assert.match(page, /WhatsApp \{site\.whatsapp\}/);
  assert.match(page, /dateTime\(site\.latestAt\)/);
});


test('tomorrow work readiness distinguishes declared materials and stock coverage', () => {
  assert.match(api, /executionReadiness/);
  assert.match(api, /Materiales no declarados/);
  assert.match(api, /Stock por confirmar/);
  assert.match(api, /Bloqueada por faltante/);
  assert.match(api, /En compra/);
  assert.match(api, /dueTomorrowNotReadyWorkOrders/);
  assert.match(page, /Mañana por confirmar/);
  assert.match(page, /Preparación/);
});


test('preventive status uses explicit source labels without cross-unit proximity thresholds', () => {
  assert.match(api, /dateReviewPreventive/);
  assert.match(api, /revisar fecha/i);
  assert.match(api, /pr\[oó\]xim/i);
  assert.doesNotMatch(api, /remainingMeter > 0 && row\.remainingMeter <= 100/);
  assert.match(page, /Revisar fecha/);
  assert.match(page, /Estado MP/);
});


test('preventive exceptions are ordered across meter bases by source severity', () => {
  assert.match(api, /function preventiveStatusRank/);
  assert.match(api, /vencid/i);
  assert.match(api, /pr\[oó\]xim/i);
  assert.match(api, /revisar fecha/i);
  assert.match(api, /preventiveStatusRank\(a\.reportedMpStatus\)/);
});


test('wallboard cross-checks declared OT materials against scoped bodega inventory by canonical product code', () => {
  assert.match(api, /work_order_material_requirements/);
  assert.match(api, /canonical_products_v1/);
  assert.match(api, /bodega_inventory/);
  assert.match(api, /organizationProductSkus/);
  assert.match(api, /stockChecks/);
  assert.match(api, /Materiales no declarados/);
  assert.match(api, /Stock por confirmar/);
  assert.match(api, /Bloqueada por faltante/);
  assert.match(page, /SKUs Bodega vinculados/);
});

test('missing OT material declaration is not presented as stock coverage', () => {
  assert.match(api, /requirements\.length === 0/);
  assert.match(api, /Materiales no declarados/);
  assert.match(page, /reservas de Bodega por separado/);
});


test('reported bodega quantity takes precedence over integer storage quantity', () => {
  assert.match(api, /numberValue\(stock\?\.quantity_reported\) \?\? numberValue\(stock\?\.quantity\)/);
  assert.match(api, /numberValue\(row\.quantity_reported\) \?\? numberValue\(row\.quantity\)/);
});


test('planning readiness separates stock availability reservation and delivery', () => {
  assert.match(api, /Stock informado disponible/);
  assert.match(api, /Reservada · pendiente entrega/);
  assert.match(api, /parts_requested/);
  assert.match(api, /parts_issued/);
  assert.match(api, /partsInstalled/);
});


test('wallboard labels recent bodega stock as advisory while reservation remains canonical warehouse stock', () => {
  assert.match(api, /role: 'advisory_stock_signal'/);
  assert.match(api, /reservationSource: 'warehouse_stock'/);
  assert.match(page, /stock informado/);
  assert.match(page, /reservas de Bodega por separado/);
});


test('wallboard excludes conflicted inventory from usable stock coverage', () => {
  assert.match(api, /getInventoryConflictEvidence/);
  assert.match(api, /trustedBodegaRows/);
  assert.match(api, /conflictedSkus/);
  assert.match(page, /Productos por revisar/);
  assert.match(page, /Productos con stock disponible/);
});
