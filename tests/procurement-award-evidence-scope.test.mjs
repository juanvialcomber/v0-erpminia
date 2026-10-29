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
  assert.doesNotMatch(segment, /savings|avoided cost|roi/i);
});