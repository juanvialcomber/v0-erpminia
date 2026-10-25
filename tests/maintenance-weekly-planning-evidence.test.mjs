import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const evidenceApi = fs.readFileSync('app/api/planning/maintenance/evidence/route.ts', 'utf8');
const workspace = fs.readFileSync('components/maintenance/weekly-maintenance-planning.tsx', 'utf8');
const scorecard = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

test('weekly planning evidence stays authenticated and maintenance scoped', () => {
  assert.match(evidenceApi, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
  assert.match(evidenceApi, /getOrganizationContext\(request\)/);
  assert.match(evidenceApi, /organization_id: context\.organizationId/);
  assert.match(evidenceApi, /user_id: context\.userId/);
});

test('weekly planning evidence separates session preparation from human action', () => {
  assert.match(evidenceApi, /maintenance_weekly_planning_session_started/);
  assert.match(evidenceApi, /maintenance_weekly_planning_decision_opened/);
  assert.match(evidenceApi, /not saved time or economic impact/);
  assert.match(evidenceApi, /not acceptance, savings, or outcome/);
  assert.match(workspace, /event: 'session_started'/);
  assert.match(workspace, /event: 'decision_opened'/);
  assert.match(workspace, /keepalive: true/);
});

test('weekly planning scorecard measures engagement without claiming ROI', () => {
  assert.match(scorecard, /weeklyPlanning:/);
  assert.match(scorecard, /decisionsOpened/);
  assert.match(scorecard, /uniqueAssetsEngaged/);
  assert.match(scorecard, /medianDecisionLatencySeconds/);
  assert.match(scorecard, /human engagement with weekly decisions prepared by MOTIL; not acceptance, saved time, or economic impact/);
});
