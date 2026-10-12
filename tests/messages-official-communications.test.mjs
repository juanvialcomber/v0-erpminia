import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261012124000_motil_messages_receipts_greenapi_ready.sql');
const unreadApi = read('app/api/messages/unread/route.ts');
const peopleApi = read('app/api/messages/people/route.ts');
const finder = read('components/messages/recipient-search.tsx');
const notifier = read('components/messages/message-notifications.tsx');
const chat = read('components/messages/motil-messages.tsx');
const history = read('app/api/messages/thread/[threadId]/route.ts');
const dispatcher = read('lib/messages/push-dispatcher.ts');
const header = read('components/layout/header.tsx');
const sidebar = read('components/layout/sidebar.tsx');

test('header notification and channel badges share the authenticated unread source', () => {
  assert.match(unreadApi, /getOrganizationContext\(request\)/);
  assert.match(unreadApi, /motil_message_inbox/);
  assert.match(unreadApi, /Number\(row\.unread_count\) > 0/);
  assert.match(unreadApi, /totalUnread: conversations\.reduce/);
  assert.match(unreadApi, /\.eq\('organization_id', ctx\.organizationId\)/);
  assert.match(notifier, /'\/api\/messages\/unread'/);
  assert.match(notifier, /refreshInterval: 6000/);
  assert.match(notifier, /thread=\$\{encodeURIComponent\(conversation\.id\)\}/);
  assert.match(header, /<MessageNotifications locale=\{locale\}/);
  assert.match(sidebar, /<MessageUnreadBadge\/>/);
});

test('messages are marked read only after their conversation is explicitly opened', () => {
  assert.match(chat, /const selected = preferredThread/);
  assert.doesNotMatch(chat, /\|\| inbox\?\.conversations\.find\(\(c\) => c\.kind === 'general'\)/);
  assert.match(chat, /document\.visibilityState !== 'visible'/);
  assert.match(chat, /!mobileConversation\) return;/);
  assert.match(chat, /searchParams\.get\('thread'\)/);
  assert.match(chat, /motil-message-recipient|<RecipientSearch/);
  assert.match(chat, /setUnreadOnly\(true\)/);
  assert.match(chat, /unreadOnly \? t\.noneUnread : t\.noChats/);
});

test('search finds active coworkers only inside the authenticated organization', () => {
  assert.match(peopleApi, /getOrganizationContext\(request\)/);
  assert.match(peopleApi, /\.eq\('organization_id', ctx\.organizationId\)/);
  assert.match(peopleApi, /\.eq\('status', 'active'\)/);
  assert.match(peopleApi, /\.neq\('id', ctx\.userId\)/);
  assert.match(peopleApi, /\.limit\(20\)/);
  assert.match(finder, /onClick=\{\(\) => choose\(person\.id\)\}/);
  assert.match(finder, /Search/);
});

test('read receipts and phone delivery events are append-only, tenant-scoped and auditable', () => {
  for (const table of ['motil_message_read_events','motil_message_transport_events',
    'motil_message_provider_settings','motil_message_external_events']) {
    assert.match(migration, new RegExp('create table if not exists public\\.' + table));
    assert.match(migration, new RegExp('alter table public\\.' + table + ' enable row level security'));
  }
  assert.match(migration, /returning profile_id into advanced_id/);
  assert.match(migration, /where public\.motil_message_reads\.last_read_at < excluded\.last_read_at/);
  assert.match(migration, /on conflict \(thread_id, profile_id, message_id\) do nothing/);
  assert.match(migration, /motil_message_finish_push/);
  assert.match(migration, /insert into public\.motil_message_transport_events/);
  assert.match(dispatcher, /motil_message_finish_push/);
  assert.match(dispatcher, /allExpired/);
  assert.match(history, /readByRecipient:/);
  assert.match(history, /recipientCount:/);
  assert.match(chat, /t\.awaitingRead/);
  assert.match(chat, /t\.readBy/);
});

test('Green API is only staged, never enabled or supplied with secrets by default', () => {
  assert.match(migration, /enabled boolean not null default false/);
  assert.match(migration, /inbound_ingest_enabled boolean not null default false/);
  assert.match(migration, /processing_status text not null default 'quarantined'/);
  assert.match(migration, /unique \(organization_id, provider, provider_event_id, event_type\)/);
  assert.match(migration, /select id,'greenapi',false/);
  assert.doesNotMatch(migration, /apiTokenInstance|apiToken:|Authorization: Bearer/);
  assert.doesNotMatch(dispatcher, /greenapi\.com/);
});
