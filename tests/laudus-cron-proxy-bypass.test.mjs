import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const proxy = fs.readFileSync('proxy.ts','utf8');

const cronPaths = [
  '/api/cron/laudus-procurement-daily',
  '/api/cron/laudus-suppliers-weekly',
  '/api/cron/laudus-warehouses-weekly',
  '/api/cron/laudus-bank-statements-daily',
  '/api/cron/laudus-accounting-entries-daily',
  '/api/cron/laudus-waybills-daily',
];

test('all Laudus background sync routes bypass session middleware',()=>{
  for (const path of cronPaths) assert.match(proxy,new RegExp(path.replaceAll('/','\\/')));
});

test('each bypassed Laudus cron still fails closed on CRON_SECRET inside its route',()=>{
  for (const path of cronPaths) {
    const routePath = 'app' + path + '/route.ts';
    const route = fs.readFileSync(routePath,'utf8');
    assert.match(route,/CRON_SECRET/);
    assert.match(route,/authorization/);
    assert.match(route,/Bearer/);
    assert.match(route,/status:\s*401/);
  }
});

test('public API bypass remains exact-path only',()=>{
  assert.match(proxy,/PUBLIC_API_ROUTES\.has\(pathname\)/);
  assert.doesNotMatch(proxy,/pathname\.startsWith\('\/api\/cron\/laudus/);
});
