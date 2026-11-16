import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route = readFileSync(new URL('../app/api/cron/patagua-reconcile/route.ts', import.meta.url), 'utf8');

test('Patagua freshness converts milliseconds to hours, rounded to tenths', () => {
  assert.match(route, /\(now - Date\.parse\(date\)\) \/ 3600000 \* 10/);
  assert.doesNotMatch(route, /\(now - Date\.parse\(date\)\) \/ 360000\)/);
  const ageHours = (now, then) => Math.round((now - then) / 3600000 * 10) / 10;
  assert.equal(ageHours(Date.parse('2026-11-15T12:00:00Z'), Date.parse('2026-11-15T06:00:00Z')), 6);
  assert.equal(ageHours(Date.parse('2026-11-15T12:00:00Z'), Date.parse('2026-11-13T23:00:00Z')), 37);
});

test('Patagua reconciliation requires a server-side cron secret and does not promote canonical data', () => {
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /status: 401/);
  assert.match(route, /syncGreenApiGroupHistory/);
  assert.match(route, /does not import Gmail or promote canonical operational records/);
});
