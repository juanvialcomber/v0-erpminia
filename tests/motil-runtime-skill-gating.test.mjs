import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const catalog = readFileSync(new URL('../lib/motil-ai/skills/catalog.ts', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../lib/motil-ai/skills/readiness.ts', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../lib/motil-ai/skills/runtime-availability.ts', import.meta.url), 'utf8');
const operational = readFileSync(new URL('../lib/intelligence/operational-domain-assistant.ts', import.meta.url), 'utf8');
const maintenance = readFileSync(new URL('../app/api/maintenance/senior-assistant/route.ts', import.meta.url), 'utf8');
const dataQuality = readFileSync(new URL('../app/api/data-quality/assistant/route.ts', import.meta.url), 'utf8');

test('skill catalog is syntactically free of accidental double separators', () => {
  assert.doesNotMatch(catalog, /},,/);
});

test('runtime availability is tenant scoped and derives Laudus state from actual integration runs', () => {
  assert.match(runtime, /organization_id', org/);
  assert.match(runtime, /sync_runs/);
  assert.match(runtime, /reconciliation_items/);
  assert.match(runtime, /laudus = 'updated'/);
  assert.match(runtime, /laudus = 'review'/);
});

test('alternative evidence paths are supported without converting them into action authority', () => {
  assert.match(catalog, /evidenceMode\?: 'all' \| 'any'/);
  assert.match(readiness, /skill\.evidenceMode === 'any'/);
  assert.match(readiness, /canAct: false/);
});

test('operational assistant receives runtime skill plan and keeps evidence authoritative', () => {
  assert.match(operational, /resolveMotilSkillAvailability/);
  assert.match(operational, /PLAN DE SKILLS NO CANÓNICO/);
  assert.match(operational, /skillPlan: plannedSkills/);
  assert.match(operational, /Skills orientan composición; nunca sustituyen evidencia ni permisos/);
});

test('maintenance assistant receives the same runtime skill boundary', () => {
  assert.match(maintenance, /resolveMotilSkillAvailability/);
  assert.match(maintenance, /PLAN DE SKILLS NO CANÓNICO/);
  assert.match(maintenance, /skillPlan: plannedSkills/);
});

test('data quality assistant receives runtime skill state without gaining mutation authority', () => {
  assert.match(dataQuality, /resolveMotilSkillAvailability/);
  assert.match(dataQuality, /PLAN DE SKILLS NO CANÓNICO/);
  assert.match(dataQuality, /Ninguna skill amplía permisos, cambia la fuente ni cierra una revisión/);
});


test('data guardian keeps a native MOTIL evidence path even before Laudus is active', () => {
  const sourceState = readFileSync(new URL('../lib/motil-ai/skills/source-state.ts', import.meta.url), 'utf8');
  assert.match(sourceState, /new Set<string>\(\['data_reconciliation_reviews'\]\)/);
  assert.match(sourceState, /integration\.reconciliation_items/);
});


test('executive assistant gates priorities with runtime skills', () => {
  const executive = readFileSync(new URL('../app/api/intelligence/executive-assistant/route.ts', import.meta.url), 'utf8');
  assert.match(executive, /resolveMotilSkillAvailability/);
  assert.match(executive, /PLAN DE SKILLS NO CANÓNICO/);
  assert.match(executive, /skillPlan: plannedSkills/);
  assert.match(executive, /una DORMANT no debe participar de una prioridad ejecutiva/);
});
