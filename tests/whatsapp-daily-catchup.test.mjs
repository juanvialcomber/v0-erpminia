import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../app/api/cron/whatsapp-daily/route.ts', import.meta.url), 'utf8');

test('whatsapp daily cron uses a bounded catch-up window', () => {
  assert.match(source, /const reportDates = \[1, 2, 3\]/);
  assert.match(source, /for \(const reportDate of reportDates\)/);
  assert.match(source, /p_report_date: reportDate/);
});

test('whatsapp daily catch-up remains idempotent through the claim RPC', () => {
  assert.match(source, /motil_whatsapp_claim_daily_report/);
  assert.match(source, /if \(!claim\.data\) \{ results\.push\(\{reportDate,organizationId,state:'already_processed'\}\);continue; \}/);
});

test('whatsapp daily evidence and persistence stay scoped to each recovered report date', () => {
  assert.match(source, /p_report_date:reportDate,p_limit:251/);
  assert.match(source, /\.eq\('report_date',reportDate\)/);
  assert.match(source, /JSON\.stringify\(\{date:reportDate,truncated,evidence\}\)/);
});
