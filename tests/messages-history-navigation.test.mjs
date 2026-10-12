import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function source(path) {
  return readFileSync(new URL('../' + path, import.meta.url), 'utf8');
}
const search = source('app/api/messages/search/route.ts');
const history = source('app/api/messages/thread/[threadId]/route.ts');
const chat = source('components/messages/motil-messages.tsx');

test('historical search restricts messages to the verified actor and organization', () => {
  assert.match(search, /getOrganizationContext\(request\)/);
  assert.match(search, /\.eq\('organization_id', ctx\.organizationId\)/);
  assert.match(search, /kind\.eq\.general,participant_a\.eq\.\$\{ctx\.userId\},participant_b\.eq\.\$\{ctx\.userId\}/);
  assert.match(search, /\.in\('thread_id', threads\.map\(\(thread\) => thread\.id\)\)/);
  assert.match(search, /\.ilike\('body', '%' \+ query \+ '%'\)/);
  assert.match(search, /\.limit\(25\)/);
  assert.doesNotMatch(search, /request\.nextUrl\.searchParams\.get\('organizationId'\)/);
});

test('history pagination anchors to an authorized message by ID plus precise timestamp', () => {
  assert.match(history, /getAuthorizedChatThread\(ctx, threadId\)/);
  assert.match(history, /const beforeId = request\.nextUrl\.searchParams\.get\('beforeId'\)/);
  assert.match(history, /const anchorId = request\.nextUrl\.searchParams\.get\('anchor'\)/);
  assert.match(history, /beforeId && \(!UUID_PATTERN\.test\(beforeId\)/);
  assert.match(history, /\.eq\('thread_id', thread\.id\)\.eq\('id', cursorId\)\.maybeSingle\(\)/);
  assert.match(history, /created_at\.lt\.\$\{anchor\.created_at\}/);
  assert.match(history, /created_at\.eq\.\$\{anchor\.created_at\},id\.\$\{anchorId \? 'lte' : 'lt'\}/);
  assert.match(chat, /\?beforeId=/);
  assert.match(chat, /\?anchor=/);
  assert.doesNotMatch(chat, /\?before=' \+ encodeURIComponent/);
});

test('read receipts require the visible, focused conversation bottom', () => {
  assert.match(chat, /document\.visibilityState !== 'visible'/);
  assert.match(chat, /!document\.hasFocus\(\)/);
  assert.match(chat, /!atBottomRef\.current/);
  assert.match(chat, /!mobileConversation\) return;/);
  assert.match(chat, /onScroll=\{updateScrollPosition\}/);
  assert.match(chat, /visibilitychange/);
  assert.match(chat, /jumpToRecent/);
});

test('older pages preserve the current scroll and found messages are directly navigable', () => {
  assert.match(chat, /useLayoutEffect\(\(\) =>/);
  assert.match(chat, /el\.scrollTop = pending\.top \+ el\.scrollHeight - pending\.height/);
  assert.match(chat, /pendingOlderScrollRef\.current/);
  assert.match(chat, /openConversation\(result\.threadId, result\.id\)/);
  assert.match(chat, /m\.id === targetMessageId \? ' ring-2 ring-primary'/);
  assert.match(chat, /returnToRecent/);
  assert.match(chat, /new Date\(messages\[index - 1\]\.createdAt\)/);
  assert.match(chat, /!event\.nativeEvent\.isComposing/);
});

test('UUID comparison disambiguates messages that share the exact timestamp', () => {
  const rows = [
    { id: '00000000-0000-4000-8000-000000000001', createdAt: '2026-10-12T12:00:00.001321+00:00' },
    { id: '00000000-0000-4000-8000-000000000002', createdAt: '2026-10-12T12:00:00.001321+00:00' },
    { id: '00000000-0000-4000-8000-000000000003', createdAt: '2026-10-12T12:00:00.001321+00:00' },
  ];
  const olderThanLast = rows.filter((row) => row.createdAt < rows[2].createdAt ||
    (row.createdAt === rows[2].createdAt && row.id < rows[2].id));
  assert.deepEqual(olderThanLast.map((row) => row.id), [rows[0].id, rows[1].id]);
});
