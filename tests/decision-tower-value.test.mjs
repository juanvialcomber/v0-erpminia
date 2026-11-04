import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const tower = fs.readFileSync('components/dashboard/decision-tower.tsx', 'utf8');
const shell = fs.readFileSync('components/dashboard/decision-center-shell.tsx', 'utf8');
const valueApi = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');

test('decision tower reuses canonical executive decisions and limits the management surface to five', () => {
  assert.match(tower, /\/api\/dashboard\/ia-operacional/);
  assert.match(tower, /\.slice\(0, 5\)/);
  assert.match(tower, /5 decisiones de mayor presión/);
  assert.match(shell, /<DecisionTower \/>/);
});

test('decision tower attaches explicit LECV only from instrumented domains', () => {
  assert.match(valueApi, /maintenanceCoverageLevel/);
  assert.match(valueApi, /financeCoverageLevel/);
  assert.match(valueApi, /maintenanceValueLevel/);
  assert.match(valueApi, /financeValueLevel/);
  assert.match(valueApi, /lecv:/);
  assert.match(tower, /maintenanceValue\?\.lecv/);
  assert.match(tower, /financePriorityDecision\?\.lecv/);
  assert.match(tower, /LECV pendiente/);
});

test('decision tower preserves human authority and non-causal outcome semantics', () => {
  assert.match(tower, /La Torre no ejecuta decisiones/);
  assert.match(tower, /“Mejoró después” nunca significa causalidad demostrada/);
  assert.match(tower, /Outcome posterior/);
  assert.match(tower, /Responsable/);
  assert.match(tower, /Resolver/);
});
