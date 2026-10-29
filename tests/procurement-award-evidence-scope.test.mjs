import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20261029182500_procurement_award_evidence_scope.sql','utf8');
const scorecard = fs.readFileSync('app/api/value/scorecard/route.ts','utf8');

test('award evidence separates operational decisions from controlled UAT', () => {
  assert.match(migration, /evidence_scope text not null default 'operational'/);
  assert.match(migration, /check \(evidence_scope in \('operational','uat'\)\)/);
  assert.match(migration, /a9947cdd-2ca7-4792-baff-699df5f78817/);
  assert.match(migration, /where evidence_scope = 'operational'/);
});

test('award outcome view keeps UAT visible but summary excludes it', () => {
  assert.match(migration, /d\.evidence_scope/);
  assert.match(migration, /procurement_award_outcomes_v1/);
  assert.match(migration, /security_invoker = true/);
});

test('value scorecard excludes UAT from adoption and outcome evidence', () => {
  assert.match(scorecard, /isUatAwardEvidence/);
  assert.match(scorecard, /operationalDecisions/);
  assert.match(scorecard, /uatDecisions/);
  assert.match(scorecard, /NO_OPERATIONAL_SAMPLE/);
  assert.match(scorecard, /excluded from operational adoption, outcomes and ROI evidence/);
});

test('scorecard does not convert UAT into savings or ROI', () => {
  const segment = scorecard.slice(scorecard.indexOf('const procurementAwardValue'), scorecard.indexOf('const maintenanceValue'));
  assert.doesNotMatch(segment, /\b(?:savings|roi|avoidedCost|avoided_cost)\s*:/i);
});

test('supplier performance excludes procurement UAT at the intake boundary', () => {
  assert.match(migration, /alter table public\.procurement_intake_requests/);
  assert.match(migration, /procurement_intake_requests_evidence_scope_check/);
  assert.match(migration, /c473cd51-798f-4724-b0cb-c08a1bfd2ff2/);
  assert.match(migration, /4c31ddc3-50a3-4236-9d83-549f4a0d1d19/);
  assert.match(migration, /7150f4ec-19b5-412c-b505-d11c8ed55a06/);
  assert.match(migration, /with eligible_orders as/);
  assert.match(migration, /req\.evidence_scope='operational'/);
  assert.match(migration, /from public\.procurement_supplier_invoices i[\s\S]*join eligible_orders o/);
  assert.match(migration, /from public\.procurement_supplier_returns r[\s\S]*join eligible_orders o/);
  assert.match(migration, /v2_equal_available_dimensions_operational_only/);
});
