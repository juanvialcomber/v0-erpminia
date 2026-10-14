import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('app/dashboard/legal/hse-controls/page.tsx', 'utf8');
const graph = readFileSync('components/legal/hse-evidence-graph-summary.tsx', 'utf8');
const linkedApi = readFileSync('app/api/legal/hse-controls/linked/route.ts', 'utf8');
const graphApi = readFileSync('app/api/legal/hse-controls/graph/route.ts', 'utf8');
const targetSql = readFileSync('supabase/migrations/20261014193000_hse_verified_target_lookup.sql', 'utf8');
const graphSql = readFileSync('supabase/migrations/20261014200000_hse_evidence_graph_edges.sql', 'utf8');

test('HSE controls remain subject to explicit human review', () => {
  assert.match(page, /validation_status === 'pending'/);
  assert.match(page, /Motivo de la decisión/);
  assert.match(page, /Evidencia documental/);
});

test('HSE graph distinguishes candidates from verified operational relationships', () => {
  assert.match(graph, /supports_candidate/);
  assert.match(graph, /linked_to/);
  assert.match(graph, /no acredita cumplimiento/i);
  assert.match(graphSql, /l\.status='verified'/);
  assert.match(graphSql, /c\.validation_status='verified'/);
});

test('Operational linked controls are restricted to verified evidence and organization', () => {
  assert.match(targetSql, /l\.organization_id=p_org/);
  assert.match(targetSql, /l\.status='verified'/);
  assert.match(targetSql, /c\.validation_status='verified'/);
  assert.match(linkedApi, /getOrganizationContext/);
  assert.match(linkedApi, /getModuleAccessLevel/);
});

test('Graph read access requires authenticated legal permissions', () => {
  assert.match(graphApi, /getOrganizationContext/);
  assert.match(graphApi, /MODULE_KEYS\.LEGAL_MODULO/);
  assert.match(graphApi, /status: 403/);
});

const qa = JSON.parse(readFileSync('tests/fixtures/hse-grounded-qa.v1.json', 'utf8'));
test('HSE evaluation fixture has grounded and abstention cases with explicit source state', () => {
  assert.equal(qa.cases.length, 6);
  assert.ok(qa.source.endsWith('.pdf'));
  const grounded = qa.cases.filter(row => row.expectedRule);
  const abstain = qa.cases.filter(row => !row.expectedRule);
  assert.equal(grounded.length, 3);
  assert.equal(abstain.length, 3);
  assert.deepEqual(grounded.map(row => row.expectedRule).sort(), ['RTIMIN-2.1', 'RTIMIN-5.1.2', 'RTIMIN-5.6.5']);
  for (const row of grounded) {
    assert.equal(row.expectedValidation, 'pending');
    assert.ok(row.expectedFact?.length > 10);
    assert.ok(row.mustSay.length > 10);
  }
  for (const row of abstain) {
    assert.equal(row.expectedValidation, 'not_established');
    assert.equal(row.expectedFact, null);
  }
});
