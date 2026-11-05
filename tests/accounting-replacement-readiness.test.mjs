import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261104131500_add_laudus_accounting_line_projection.sql','utf8');
const route = fs.readFileSync('app/api/finance/accounting-replacement-readiness/route.ts','utf8');
const card = fs.readFileSync('components/finance/accounting-replacement-readiness-card.tsx','utf8');
const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');

test('accounting line projection recovers management dimensions without posting them',()=>{
  assert.match(migration,/laudus_accounting_lines_service_v1/);
  assert.match(migration,/lines_account_accountNumber/);
  assert.match(migration,/lines_currencyCode/);
  assert.match(migration,/lines_costCenter_costCenterId/);
  assert.match(migration,/lines_description/);
  assert.match(migration,/Does not post or rewrite canonical operational ledger/);
});

test('accounting replacement readiness stays read only',()=>{
  assert.match(route,/MOTIL_MANAGEMENT_LEDGER/);
  assert.match(route,/financial_source_reference/);
  assert.match(route,/autoPostToMotilLedger: false/);
  assert.match(route,/autoRewriteOperationalHistory: false/);
  assert.match(route,/humanReviewRequiredForPromotion: true/);
  assert.doesNotMatch(route,/\.insert\(/);
  assert.doesNotMatch(route,/\.update\(/);
  assert.doesNotMatch(route,/\.upsert\(/);
});

test('Finance shows accounting replacement coverage honestly',()=>{
  assert.match(card,/Reemplazo contable/);
  assert.match(card,/Backfill pendiente/);
  assert.match(card,/Asientos fuente/);
  assert.match(card,/Con líneas útiles/);
  assert.match(page,/AccountingReplacementReadinessCard/);
});


test('data-quality ledger measures accounting line coverage instead of empty header dimensions',()=>{
  const dataQuality = fs.readFileSync('app/api/data-quality/reconciliation/route.ts','utf8');
  assert.match(dataQuality,/laudus_accounting_management_summary_v1/);
  assert.match(dataQuality,/entries_with_lines/);
  assert.match(dataQuality,/accountingMissingLineCoverage/);
  assert.doesNotMatch(dataQuality,/accountingMissingCurrency/);
  assert.doesNotMatch(dataQuality,/accountingMissingCostCenter/);
});
