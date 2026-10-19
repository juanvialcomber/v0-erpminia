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
  assert.match(api, /motil_whatsapp_messages/);
  assert.match(api, /pendingEmailMatches/);
  assert.match(page, /Evidencia por vincular/);
  assert.match(page, /Correo mantención La Patagua/);
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
  assert.match(page, /Disponibilidad operacional/);
  assert.match(page, /Sin base canónica/);
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
  assert.match(page, /WhatsApp entrada · Grupo 2/);
  assert.match(page, /WhatsApp vinculado a equipos/);
  assert.match(page, /Entrada viva separada de evidencia ya vinculada/);
});

test('wallboard intake metric combines current unresolved email and WhatsApp inputs without canonical promotion', () => {
  assert.match(api, /pendingEmailMatches/);
  assert.match(api, /pendingWhatsAppInputs/);
  assert.match(page, /Entradas por revisar/);
  assert.doesNotMatch(api, /update\(['"]maintenance_work_orders/);
});
