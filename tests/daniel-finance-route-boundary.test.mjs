import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const proxy = fs.readFileSync('proxy.ts','utf8');

test('finance manager can reach only the Laudus evidence routes used by the cockpit',()=>{
  assert.match(proxy,/\/api\/integrations\/laudus\/invoice-po-control/);
  assert.match(proxy,/\/api\/integrations\/laudus\/native-invoice-trace/);
  assert.match(proxy,/\/api\/integrations\/laudus\/bank-reconciliation/);
  assert.match(proxy,/\/api\/integrations\/laudus\/finance-review-feedback/);
  assert.match(proxy,/financeIntegrationRoutes\.has\(path\)/);
  assert.doesNotMatch(proxy,/path\.startsWith\('\/api\/integrations\/laudus\/'\) return true/);
});

test('read-only Laudus evidence routes remain GET-only while Daniel LEC routes are explicitly allowed',()=>{
  assert.match(proxy,/path === '\/api\/integrations\/laudus\/finance-review-feedback' \? true : readOnly/);
  assert.match(proxy,/financeValueRoutes/);
  assert.match(proxy,/\/api\/value\/finance-baseline/);
  assert.match(proxy,/\/api\/value\/finance-priority-decision/);
  assert.doesNotMatch(proxy,/path === '\/api\/value\/scorecard'/);
  assert.doesNotMatch(proxy,/path === '\/dashboard\/valor'/);
});
