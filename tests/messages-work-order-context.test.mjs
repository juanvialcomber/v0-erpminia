import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261012142500_motil_message_work_order_contexts.sql');
const api = read('app/api/messages/work-order-contexts/route.ts');
const guard = read('lib/messages/work-order-context.ts');
const component = read('components/maintenance/work-order-communications.tsx');
const detailPage = read('app/dashboard/mantenimiento/ordenes-trabajo/[id]/page.tsx');
const chat = read('components/messages/motil-messages.tsx');
const originalSend = read('app/api/messages/route.ts');

test('OT chat links are additive, tenant-bound, unique and service-only', () => {
  assert.match(migration, /create table if not exists public\.motil_message_work_order_contexts/);
  assert.match(migration, /foreign key \(thread_id,organization_id\)/);
  assert.match(migration, /unique \(organization_id,thread_id,work_order_id\)/);
  assert.match(migration, /new\.created_by in \(t\.participant_a,t\.participant_b\)/);
  assert.match(migration, /w\.organization_id = new\.organization_id/);
  assert.match(migration, /t\.kind = 'direct'/);
  assert.match(migration, /p\.status = 'active'/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /alter table public\.maintenance_work_orders/i);
  assert.doesNotMatch(migration, /insert into public\.motil_message_entries/i);
});

test('Both direct-message participants must have OT module and site permissions', () => {
  assert.match(guard, /getModuleAccessLevel\(profileId, actorContext\.role, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.match(guard, /requireAssignedMaintenanceExecution\(actorContext, workOrderId\)/);
  assert.match(guard, /resolveWorkshopHeadScope\(actorContext\)/);
  assert.match(guard, /workshopHeadCanAccessOrder\(workshop, data\)/);
  assert.match(guard, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(guard, /profile\.status !== 'active'/);
  assert.match(api, /visibleWorkOrderForProfile\(ctx, workOrderId, ctx\.userId\)/);
  assert.match(api, /visibleWorkOrderForProfile\(ctx, workOrderId, recipientId\)/);
});

test('Only a canonical direct thread is linked; linking never sends synthetic messages', () => {
  assert.match(api, /getOrganizationContext\(request\)/);
  assert.match(api, /getAuthorizedChatThread\(ctx, threadId!\)/);
  assert.match(api, /thread\.kind !== 'direct'/);
  assert.match(api, /thread\.participant_a === ctx\.userId \|\| thread\.participant_b === ctx\.userId/);
  assert.match(api, /const threadKey = `dm:\$\{a\}:\$\{b\}`/);
  assert.match(api, /onConflict: 'organization_id,thread_key', ignoreDuplicates: true/);
  assert.match(api, /onConflict: 'organization_id,thread_id,work_order_id', ignoreDuplicates: true/);
  assert.match(api, /\.eq\('organization_id', ctx\.organizationId\)/);
  assert.doesNotMatch(api, /\.from\('motil_message_entries'\)/);
  assert.match(originalSend, /\.from\('motil_message_entries'\)/);
});

test('OT and chat both navigate the single preserved canonical conversation', () => {
  assert.match(detailPage, /<WorkOrderDetail locale=\{locale\} dictionary=\{dictionary\} \/>/);
  assert.match(detailPage, /<WorkOrderCommunications workOrderId=\{id\} locale=\{locale\}/);
  assert.match(component, /<RecipientSearch locale=\{locale\}/);
  assert.match(component, /body: JSON\.stringify\(\{ workOrderId, recipientId \}\)/);
  assert.match(component, /result\.threadId/);
  assert.match(component, /\/dashboard\/mensajes\?thread=/);
  assert.match(chat, /\/api\/messages\/work-order-contexts\?threadId=/);
  assert.match(chat, /workOrderContexts\.contexts\.map/);
  assert.match(chat, /\/dashboard\/mantenimiento\/ordenes-trabajo\//);
  assert.doesNotMatch(component, /\/api\/maintenance\/work-orders\//);
});
