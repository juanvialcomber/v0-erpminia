import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}
const migration = source('supabase/migrations/20261012114500_motil_messages_open_core.sql');
const api = source('app/api/messages/route.ts');
const direct = source('app/api/messages/direct/route.ts');
const read = source('app/api/messages/read/route.ts');
const history = source('app/api/messages/thread/[threadId]/route.ts');
const dispatcher = source('lib/messages/push-dispatcher.ts');
const cron = source('app/api/cron/messages-push/route.ts');
const webPush = source('lib/notifications/web-push.ts');
const worker = source('public/motil-sw-v2.js');
const ui = source('components/messages/motil-messages.tsx');

test('Messages persist in tenant-isolated tables with service-only access', () => {
  for (const table of ['motil_message_threads', 'motil_message_entries', 'motil_message_reads', 'motil_message_push_outbox']) {
    assert.match(migration, new RegExp('create table if not exists public\\.' + table));
    assert.match(migration, new RegExp('alter table public\\.' + table + ' enable row level security'));
  }
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(migration, /unique \(organization_id, sender_id, client_message_id\)/);
  assert.match(migration, /foreign key \(thread_id, organization_id\)/);
  assert.match(migration, /grant execute on function public\.motil_message_inbox/);
});

test('All chat API requests use verified organization and thread membership', () => {
  for (const route of [api, direct, history, read]) {
    assert.match(route, /getOrganizationContext\(request\)/);
    assert.match(route, /ctx\.organizationId/);
  }
  for (const route of [api, history, read]) {
    assert.match(route, /getAuthorizedChatThread\(ctx,/);
  }
  assert.match(direct, /\.eq\('status', 'active'\)/);
  assert.match(api, /client_message_id: clientMessageId/);
  assert.match(history, /\.limit\(41\)/);
});

test('Direct Push is queued transactionally with a bounded and secured worker', () => {
  assert.match(migration, /after insert on public\.motil_message_entries/);
  assert.match(migration, /for update skip locked/);
  assert.match(dispatcher, /motil_message_claim_push/);
  assert.match(dispatcher, /acceptedDevices > 0 \? 'accepted'/);
  assert.match(dispatcher, /lease_until: null/);
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /request\.headers\.get\('authorization'\)/);
  assert.match(webPush, /tag\?: string/);
  assert.match(worker, /motil-msg-/);
  assert.match(ui, /Notification\.requestPermission\(\)/);
});

test('Chat supports persistent history, retries, people selection and both locales', () => {
  assert.match(ui, /useSWR/);
  assert.match(ui, /clientMessageId/);
  assert.match(ui, /loadOlder/);
  assert.match(ui, /enablePush/);
  assert.match(ui, /Se actualiza automáticamente/);
  assert.match(ui, /Refreshes automatically/);
  const sidebar = source('components/layout/sidebar.tsx');
  assert.match(sidebar, /href: '\/dashboard\/mensajes'/);
});

test('Choosing a recipient opens their direct thread and blocks accidental General sends', () => {
  assert.match(ui, /if \(targetId\) void createDirect\(targetId\)/);
  assert.match(ui, /const targetId = event\.target\.value;/);
  assert.match(ui, /\{ recipientId: targetId \}/);
  assert.doesNotMatch(ui, /onClick=\{\(\) => void createDirect\(\)\}/);
  assert.match(ui, /saving \|\| creating \|\| recipientId\) return;/);
  assert.match(ui, /disabled=\{saving \|\| creating \|\| Boolean\(recipientId\)\}/);
  assert.match(ui, /No se enviará a General/);
});
