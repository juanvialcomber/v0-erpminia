import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../components/dashboard/maintenance-home.tsx', import.meta.url), 'utf8');
const control = await readFile(new URL('../app/api/maintenance/control-center/route.ts', import.meta.url), 'utf8');
const evidence = await readFile(new URL('../components/maintenance/work-order-evidence-and-approval.tsx', import.meta.url), 'utf8');

test('Ariel and Mauricio see plan execution and closure actions', () => {
  assert.match(home, /planningKinds = new Set\(\[[^\]]*'plan_step'[^\]]*'ready_to_close'[^\]]*'closure_evidence'/s);
  assert.match(home, /leadershipKinds = new Set\(\[[^\]]*'plan_step'[^\]]*'ready_to_close'[^\]]*'closure_evidence'/s);
  assert.match(home, /supervisorInboxMode/);
});

test('completed OTs pending supervisor review enter the action queue', () => {
  assert.match(control, /work_order_supervisor_reviews/);
  assert.match(control, /kind: 'approval_needed'/);
  assert.match(control, /pendingApprovals/);
});

test('secondary detail is collapsed and evidence is large with visible selectable thumbnails', () => {
  assert.match(home, /<summary[^>]*>Ver detalle<\/summary>/);
  assert.match(evidence, /max-h-\[560px\]/);
  assert.match(evidence, /Miniaturas de evidencia/);
  assert.match(evidence, /setSelectedPhotoId\(photo.id\)/);
  assert.doesNotMatch(evidence, /Ver \{photos.length - 1\} evidencia/);
});


test('Ariel cockpit exposes one simple operating view over canonical maintenance signals', () => {
  assert.match(home, /Cockpit Ariel/);
  assert.match(home, /scheduledToday/);
  assert.match(home, /scheduledThisWeek/);
  assert.match(home, /pendingApprovals/);
  assert.match(home, /recurringReliabilityAssets/);
  assert.match(home, /\/dashboard\/mantenimiento\/eam/);
  assert.match(home, /\/dashboard\/mantenimiento\/confiabilidad/);
});

test('control center separates execution blockers from closeout evidence', () => {
  assert.match(control, /const executionBlocked =/);
  assert.match(control, /const closeoutPending =/);
  assert.match(control, /Resolver bloqueo de inicio/);
  assert.match(control, /Completar evidencia de cierre/);
  assert.match(control, /executionBlocking/);
  assert.match(control, /scheduledToday/);
  assert.match(control, /scheduledThisWeek/);
});
