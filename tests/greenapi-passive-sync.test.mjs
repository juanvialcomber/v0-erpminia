import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const file = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('passive history runs from a guarded server-only scheduled route', () => {
  const cron = file('app/api/cron/whatsapp-history/route.ts');
  const proxy = file('proxy.ts');
  const vercel = JSON.parse(file('vercel.json'));
  assert.match(cron, /process\.env\.CRON_SECRET/);
  assert.match(cron, /authorization/);
  assert.match(cron, /syncGreenApiGroupHistory/);
  assert.match(proxy, /\/api\/cron\/whatsapp-history/);
  assert.ok(vercel.crons.some(row => row.path === '/api/cron/whatsapp-history'));
  assert.doesNotMatch(cron, /sendMessage|sendText|outgoingWebhook/);
});

test('backfill is tenant-scoped, bounded, and rechecks approved groups', () => {
  const worker = file('lib/messages/greenapi-history-sync.ts');
  assert.match(worker, /MAX_GROUPS_PER_RUN = 4/);
  assert.match(worker, /HISTORY_LIMIT = 100/);
  assert.match(worker, /\.eq\('instance_id', instanceId\)/);
  assert.match(worker, /\.eq\('enabled', true\)/);
  assert.match(worker, /group_recheck_failed/);
  assert.match(worker, /historyMessage\(entry, group\)/);
  assert.match(worker, /group_id,provider_message_id/);
  assert.match(worker, /ignoreDuplicates: true/);
  assert.match(worker, /last_received_at/);
  assert.doesNotMatch(worker, /maintenance_work_orders|motil_message_entries/);
});

test('an incoming group message keeps source ID and never mutates a work order', () => {
  const source = file('lib/messages/greenapi-history.ts');
  assert.match(source, /row\.type !== 'incoming'/);
  assert.match(source, /row\.chatId !== group\.chat_id/);
  assert.match(source, /row\.isDeleted === true/);
  assert.match(source, /provider_message_id: id/);
  assert.match(source, /occurred_at:/);
});

test('daily message report remains read-only evidence and not a write to operations', () => {
  const daily = file('app/api/cron/whatsapp-daily/route.ts');
  assert.match(daily, /motil_whatsapp_daily_evidence/);
  assert.match(daily, /source_ids/);
  assert.match(daily, /review_status:'pending'/);
  assert.doesNotMatch(daily, /maintenance_work_orders/);
});

test('history respects provider one-request-per-second and handles a single 429 backoff', () => {
  const source=file('lib/messages/greenapi-history-sync.ts');
  assert.match(source, /setTimeout\(resolve, 1350\)/);
  assert.match(source, /error\.message !== 'Proveedor HTTP 429'/);
  assert.match(source, /setTimeout\(resolve, 2200\)/);
  assert.match(source, /greenRequest\('getChatHistory'/);
  assert.doesNotMatch(source, /sendMessage|sendFileByUrl/);
});
