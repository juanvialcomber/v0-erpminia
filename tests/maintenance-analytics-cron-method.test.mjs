import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const route = readFileSync(new URL('../app/api/cron/maintenance-analytics-daily/route.ts', import.meta.url), 'utf8');

test('maintenance analytics Vercel cron supports GET and authorized manual POST', () => {
  assert.match(route, /export const GET = runDailyMaintenanceAnalytics/);
  assert.match(route, /export const POST = runDailyMaintenanceAnalytics/);
});

test('maintenance analytics cron rejects an absent secret or wrong authorization', () => {
  assert.match(route, /!secret \|\| secret\.length < 24/);
  assert.match(route, /req\.headers\.get\('authorization'\) !== `Bearer \$\{secret\}`/);
});

test('maintenance analytics cron reports failures instead of publishing empty or unsaved summaries', () => {
  assert.match(route, /if \(organizationsError\) throw organizationsError/);
  assert.match(route, /if \(workOrdersError\) throw/);
  assert.match(route, /if \(upsertError\) throw/);
  assert.match(route, /Maintenance analytics database not configured/);
});
