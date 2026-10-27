import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(
  new URL('../app/api/cron/laudus-financial-masters-daily/route.ts', import.meta.url),
  'utf8',
);
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

test('Laudus financial cron is secret-gated and bounded to enabled organizations', () => {
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /authorization/);
  assert.match(route, /laudus_source_status_service_v1/);
  assert.match(route, /\.limit\(10\)/);
  assert.match(route, /syncLaudusFinancialMasters/);
});

test('Laudus financial cron is scheduled once daily away from existing heavy jobs', () => {
  assert.match(vercel, /\/api\/cron\/laudus-financial-masters-daily/);
  assert.match(vercel, /20 4 \* \* \*/);
});
