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


test('standard plan outcomes become calibration evidence without becoming ROI', () => {
  assert.match(scorecard, /standardPlanLearning:/);
  assert.match(scorecard, /motilDecisions/);
  assert.match(scorecard, /acceptanceRatePct/);
  assert.match(scorecard, /medianDecisionCycleSeconds/);
  assert.match(scorecard, /acceptance is calibration evidence, not economic impact/);
});

test('standard plan API validates steps before inserting the plan and audits human outcome', () => {
  const route = fs.readFileSync('app/api/maintenance/standard-job-plans/route.ts','utf8');
  const page = fs.readFileSync('app/dashboard/mantenimiento/planes-estandar/page.tsx','utf8');
  assert.ok(route.indexOf("Cada paso requiere un título.") < route.indexOf(".from('maintenance_standard_job_plans').insert"));
  assert.match(route, /maintenance_standard_plan_decision/);
  assert.match(route, /proposal_source/);
  assert.match(page, /Descartar/);
  assert.doesNotMatch(page, /quantityRequired:Number\(row\.quantityRequired\|\|1\)/);
});


test('maintenance value scorecard exposes the cross-domain supply funnel conservatively', () => {
  assert.match(scorecard, /supplyChainFunnel/);
  assert.match(scorecard, /withRequirements/);
  assert.match(scorecard, /withRequest/);
  assert.match(scorecard, /withOrder/);
  assert.match(scorecard, /withDeliveredOrder/);
  assert.match(scorecard, /withInstalledParts/);
  assert.match(scorecard, /closedWithOpenShortage/);
  assert.match(scorecard, /historical closed shortages are data-quality debt, not active compliance/);
});


test('Ariel can correct proposed MOTIL plans without weakening approval authority', () => {
  const progressive = fs.readFileSync('app/api/maintenance/standard-job-plans/progressive/route.ts','utf8');
  const editor = fs.readFileSync('components/maintenance/standard-plan-editor.tsx','utf8');
  assert.match(progressive, /action === 'update_step'/);
  assert.match(progressive, /action === 'remove_step'/);
  assert.match(progressive, /action === 'update_material'/);
  assert.match(progressive, /action === 'remove_material'/);
  assert.match(progressive, /maintenance_standard_plan_edited/);
  assert.match(progressive, /Sólo se editan planes propuestos/);
  assert.match(progressive, /El plan debe conservar al menos un paso/);
  assert.match(editor, /Corregir propuesta MOTIL/);
  assert.match(editor, /Cada cambio queda registrado/);
});

test('standard plan learning measures correction as calibration rather than ROI', () => {
  assert.match(scorecard, /editedPlans/);
  assert.match(scorecard, /correctionRatePct/);
  assert.match(scorecard, /acceptance and correction are calibration evidence, not economic impact/);
});
