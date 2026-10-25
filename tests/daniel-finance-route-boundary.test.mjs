import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const proxy = fs.readFileSync('proxy.ts','utf8');

test('finance manager can reach only the Laudus evidence routes used by the cockpit',()=>{
  assert.match(proxy,/\/api\/integrations\/laudus\/invoice-po-control/);
  assert.match(proxy,/\/api\/integrations\/laudus\/native-invoice-trace/);
  assert.match(proxy,/\/api\/integrations\/laudus\/finance-review-feedback/);
  assert.match(proxy,/financeIntegrationRoutes\.has\(path\)/);
  assert.doesNotMatch(proxy,/path\.startsWith\('\/api\/integrations\/laudus\/'\) return true/);
});

test('read-only trace routes remain GET-only while finance feedback keeps its route-level authorization',()=>{
  assert.match(proxy,/path === '\/api\/integrations\/laudus\/finance-review-feedback' \? true : readOnly/);
  assert.match(proxy,/path === '\/api\/value\/finance-baseline'/);
});
