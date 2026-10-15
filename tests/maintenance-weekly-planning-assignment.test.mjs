import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeWorkOrderDateKey, daysUntilWorkOrderDate } from '../lib/maintenance/work-order-calendar-date.mjs';

const read = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');

test('Ariel planner cargo has explicit creation capability with ED permission and linked identity', () => {
  const capability = read('lib/maintenance/work-order-create-access.ts');
  const context = read('app/api/maintenance/viewer-context/route.ts');
  assert.match(capability, /cargo === 'jefe de planificación'/);
  assert.match(capability, /Boolean\(person\?\.id\) && accessLevel === 'ED'/);
  assert.match(context, /canCreateWorkOrder/);
  assert.match(context, /creationCapability\.canCreate/);
});

test('manual work-order creation requires a canonical assignee, asset and selected calendar date', () => {
  const form = read('components/maintenance/create-work-order.tsx');
  const api = read('app/api/maintenance/work-orders/route.ts');
  const assignees = read('app/api/maintenance/assignees/route.ts');
  assert.match(form, /if \(!assignedPersonId\)/);
  assert.match(form, /if \(!canonicalAssetId\)/);
  assert.match(form, /if \(!scheduledDate\)/);
  assert.match(form, /<Input id="scheduled-date" type="date"/);
  assert.match(form, /assignedPersonId,\s*canonicalAssetId,/);
  assert.match(form, /scheduledDate,\s*plannedDurationHours/);
  assert.match(api, /getMaintenanceWorkOrderCreationCapability\(context\)/);
  assert.match(api, /if \(!creationCapability\.canCreate\)/);
  assert.match(api, /assigned_person_id: assignedPersonId/);
  assert.match(api, /scheduled_date: body\.scheduledDate \|\| body\.scheduled_date \|\| null/);
  assert.match(api, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(assignees, /\.eq\('employment_status', 'active'\)/);
  assert.match(assignees, /\.not\('profile_id', 'is', null\)/);
  assert.equal(normalizeWorkOrderDateKey('2026-10-23'), '2026-10-23');
  assert.equal(daysUntilWorkOrderDate('2026-10-23', '2026-10-15'), 8);
});

test('operational and executor inbox expose scheduled work regardless of future date', () => {
  const orders = read('app/api/maintenance/work-orders/route.ts');
  const mine = read('app/api/maintenance/my-work/route.ts');
  assert.doesNotMatch(orders, /\.lte\('scheduled_date'/);
  assert.doesNotMatch(mine, /\.lte\('scheduled_date'/);
  assert.match(orders, /query = query\.eq\('assigned_person_id', executionScope\.personId\)/);
  assert.match(mine, /\.eq\('assigned_person_id', person\.id\)/);
  assert.match(mine, /'planned', 'in_progress'/);
});

test('preventive plan generated OT requires a human-selected executor in the same tenant and records assignment', () => {
  const api = read('app/api/maintenance/preventive/route.ts');
  const board = read('components/maintenance/preventive-plan-board.tsx');
  assert.match(api, /const assignedPersonId = String\(body\.assignedPersonId \|\| ''\)\.trim\(\)/);
  assert.match(api, /if \(!uuid\.test\(assignedPersonId\)\)/);
  assert.match(api, /\.from\('preventive_maintenance_schedules'\)[\s\S]*?\.eq\('organization_id', context\.organizationId\)\.eq\('id', scheduleId\)/);
  assert.match(api, /\.from\('people'\)[\s\S]*?\.eq\('employment_status', 'active'\)\.not\('profile_id', 'is', null\)/);
  const checkSchedule = api.indexOf("if (!schedule) return");
  const callRpc = api.indexOf("context.supabase.rpc(\n        'create_work_order_from_schedule'");
  assert.ok(checkSchedule >= 0 && callRpc > checkSchedule, 'tenant and assignee validation precedes privileged RPC');
  assert.match(api, /if \(!schedule\.next_scheduled_date\)/);
  assert.match(api, /\.is\('assigned_person_id', null\)\.select\('id'\)/);
  assert.match(api, /assigned_person_id: person\.id, assigned_to_name: person\.full_name/);
  assert.match(api, /event_type: 'schedule_executor_assigned'/);
  assert.match(board, /generationAssigneeId/);
  assert.match(board, /Seleccionar responsable/);
  assert.match(board, /assignedPersonId: action === 'generate' \? generationAssigneeId/);
  assert.match(board, /Generar y asignar OT/);
});

test('legacy plans without a date cannot silently generate for today, but provide manual scheduling', () => {
  const api = read('app/api/maintenance/preventive/route.ts');
  const board = read('components/maintenance/preventive-plan-board.tsx');
  assert.match(api, /if \(!schedule\.next_scheduled_date\)/);
  assert.match(api, /Este plan no tiene fecha/);
  assert.match(board, /!schedule\.next_scheduled_date/);
  assert.match(board, /Programar OT/);
  assert.match(board, /pathname: '\/dashboard\/mantenimiento\/ordenes-trabajo\/create'/);
  assert.match(board, /assetId: schedule\.canonical_asset_id \|\| schedule\.asset_id/);
  assert.match(board, /title: schedule\.task_name/);
});

test('planning landing offers direct scheduling only to authorized creators', () => {
  const page = read('app/dashboard/planificacion/page.tsx');
  assert.match(page, /maintenanceViewer\?\.canCreateWorkOrder/);
  assert.match(page, /Programar OT/);
  assert.match(page, /\/dashboard\/mantenimiento\/ordenes-trabajo\/create/);
});
