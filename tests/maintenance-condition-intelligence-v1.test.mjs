import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const api = readFileSync(new URL('../app/api/maintenance/condition-intelligence/route.ts', import.meta.url), 'utf8');
const review = readFileSync(new URL('../app/api/maintenance/condition-intelligence/review/route.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261103204000_maintenance_condition_signal_reviews.sql', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../components/maintenance/maintenance-condition-intelligence.tsx', import.meta.url), 'utf8');
const lubrication = readFileSync(new URL('../components/maintenance/maintenance-lubrication-intelligence.tsx', import.meta.url), 'utf8');

test('condition intelligence is equipment-specific and refuses signals with insufficient history', () => {
  assert.match(api, /minimumDerivedIntervals: 4/);
  assert.match(api, /derivedIntervals\.length >= 4/);
  assert.match(api, /median\(history\)/);
  assert.match(api, /mad\(history, center\)/);
  assert.match(api, /insufficientHistoryCreatesSignal: false/);
});

test('derived anomaly is a review signal rather than a diagnosis or work order', () => {
  assert.match(api, /review_required|conditionState/);
  assert.match(api, /mechanicalDiagnosis: false/);
  assert.match(api, /createsWorkOrder: false/);
  assert.match(ui, /no diagnostica una falla ni crea una OT/);
});

test('evidence score exposes its deterministic components and meaning', () => {
  assert.match(api, /runtime: Math\.min\(40/);
  assert.match(api, /fluidUsage: Math\.min\(30/);
  assert.match(api, /waste: Math\.min\(15/);
  assert.match(api, /planning: input\.plans > 0 \? 15 : 0/);
  assert.match(api, /Operational evidence readiness, not mechanical health/);
});

test('human review is tenant scoped and never changes canonical state', () => {
  assert.match(migration, /maintenance_condition_signal_reviews_org_isolation/);
  assert.match(review, /canonicalStateMutated: false/);
  assert.match(review, /workOrderCreated: false/);
  assert.match(review, /maintenance_canonical_assets_v1/);
});

test('forecast uncertainty is empirical and omitted without enough samples', () => {
  assert.match(api, /minimumSamples: 3/);
  assert.match(api, /values\.length < 3/);
  assert.match(api, /median ± 1\.4826 × MAD/);
  assert.match(lubrication, /Rango N\/D · falta historia/);
});

test('condition UI exposes review actions without automatic escalation', () => {
  assert.match(ui, /Seguir mirando/);
  assert.match(ui, /Descartar/);
  assert.match(ui, /Confirmar señal/);
  assert.doesNotMatch(ui, /Crear OT automáticamente|auto.*OT/i);
});
