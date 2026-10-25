import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/planificacion/asistente/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/planificacion/asistente/page.tsx', import.meta.url), 'utf8');
const dict = await readFile(new URL('../lib/i18n/dictionaries.ts', import.meta.url), 'utf8');
const plansPage = await readFile(new URL('../app/dashboard/mantenimiento/planes-estandar/page.tsx', import.meta.url), 'utf8');

test('Ariel planning assistant reads real transversal sources and is tenant scoped', () => {
  for (const source of [
    'planning_maintenance_priority_v1',
    'planning_maintenance_source_rows',
    'operational_attention_global_v1',
    'preventive_maintenance_hour_status_v1',
    'production_monthly_plans',
    'canonical_inventory_current',
    'canonical_purchase_orders_current',
  ]) assert.match(api, new RegExp(source));
  assert.match(api, /\.eq\('organization_id', context\.organizationId\)/);
});

test('Ariel planning assistant preserves human authority and does not mutate operational data', () => {
  assert.match(api, /Ariel mantiene autoridad final sobre programación/);
  assert.match(api, /no ejecuta cambios/i);
  assert.doesNotMatch(api, /\.insert\(/);
  assert.doesNotMatch(api, /\.update\(/);
  assert.doesNotMatch(api, /\.delete\(/);
});

test('planning assistant UI exposes current-data semantics and stewardship path', () => {
  assert.match(page, /datos reales de Mantenimiento, Producción, Bodega y Compras/i);
  assert.match(page, /\/dashboard\/planificacion\/datos/);
  assert.match(dict, /assistant: 'Asistente Ariel'/);
});


test('Ariel planning assistant can propose standard plans without creating or approving them', () => {
  assert.match(api, /maintenance_work_orders/);
  assert.match(api, /maintenance_standard_job_plans/);
  assert.match(api, /PROPUESTAS DE PLAN ESTÁNDAR/);
  assert.match(api, /duración sugerida sólo si hay evidencia histórica/);
  assert.match(api, /Antes de sugerir un plan nuevo, revisa los planes estándar existentes/);
  assert.match(page, /Proponme hasta 3 planes estándar/);
  assert.match(page, /Abrir planes estándar/);
  assert.match(page, /Ariel puede abrir el registro de planes, completar los datos faltantes y aprobarla/);
});


test('real plan candidates open the standard-plan form with evidence-backed prefill only', () => {
  assert.match(api, /planCandidates/);
  assert.match(api, /latestPreventiveByAsset/);
  assert.match(api, /\|\| !\(row as any\)\.closed_at\) continue/);
  assert.match(api, /estimatedDurationHours/);
  assert.match(page, /Candidatos con evidencia real/);
  assert.match(page, /Preparar plan/);
  assert.match(plansPage, /searchParams\.get\('durationHours'\)/);
  assert.match(plansPage, /searchParams\.get\('evidence'\)/);
  assert.match(plansPage, /MOTIL prellena sólo campos sustentados/);
  assert.match(plansPage, /Ariel debe completar pasos, controles y personas, y confirmar o quitar materiales antes de aprobar/);
});


test('real plan pilot carries all canonical OT material requirements as reviewable evidence', () => {
  assert.match(api, /work_order_material_requirements/);
  assert.match(api, /canonical\.products/);
  assert.match(api, /materialSemantics/);
  assert.match(page, /materiales son evidencia observada, no una promesa de tiempo ni consumo futuro/);
  assert.match(plansPage, /parsePrefilledMaterials/);
  assert.match(plansPage, /material\(es\) requeridos en la OT fuente fueron cargados para revisión/);
  assert.match(plansPage, /confirmar o quitar materiales antes de aprobar/);
  assert.match(plansPage, /materials:materialPayload/);
});
