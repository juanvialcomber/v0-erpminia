import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827191500_add_treasury_aging_alerts_and_tenant_safe_rpc_v1.sql','utf8');
const executiveRoute = fs.readFileSync('app/api/finance/executive/route.ts','utf8');
const financePage = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');

test('treasury alerts cover missing due date, due soon, overdue and unreconciled payments',()=>{
  assert.match(migration,/treasury_missing_due_date/);
  assert.match(migration,/treasury_due_soon/);
  assert.match(migration,/treasury_overdue/);
  assert.match(migration,/treasury_unreconciled_payments/);
  assert.match(migration,/current_date\+7/);
});

test('aging keeps missing due dates separate from overdue buckets',()=>{
  assert.match(migration,/no_due_date/);
  assert.match(migration,/overdue_1_30/);
  assert.match(migration,/overdue_31_60/);
  assert.match(migration,/overdue_61_90/);
  assert.match(migration,/overdue_90_plus/);
});

test('canonical finance alerts include treasury so JEFE ADM existing routing receives them',()=>{
  assert.match(migration,/create or replace view public\.canonical_finance_alerts/);
  assert.match(migration,/procurement_treasury_alerts_v1/);
});

test('finance executive preserves treasury and aging data while the cockpit stays decision focused',()=>{
  assert.match(executiveRoute,/procurement_treasury_summary_v1/);
  assert.match(executiveRoute,/procurement_accounts_payable_aging_summary_v1/);
  assert.match(executiveRoute,/treasuryAging/);
  assert.match(financePage,/currencyMoney/);
  assert.match(financePage,/CxP aprobadas en MOTIL/);
  assert.doesNotMatch(financePage,/Aging por proveedor/);
});
