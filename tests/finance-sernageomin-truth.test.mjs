import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync('app/dashboard/finanzas/page.tsx', 'utf8');
test('financial numbers distinguish missing evidence from real zero', () => {
  assert.match(page, /typeof value === 'number' && Number\.isFinite\(value\)/);
  assert.doesNotMatch(page, /Number\(value \|\| 0\)/);
  assert.match(page, /const overview = error \? \{\} :/);
});
test('closure valuation stays out of the finance cockpit and remains linked to legal evidence', () => {
  assert.doesNotMatch(page, /valorización aprobada del plan de cierre/);
  assert.doesNotMatch(page, /garantías financieras constituidas/);
  assert.match(page, /dashboard\/legal/);
});

test('finance does not infer currency without evidence', () => {
  assert.match(page, /if \(!code\) return '—'/);
  assert.doesNotMatch(page, /String\(currency \|\| 'CLP'\)/);
  assert.doesNotMatch(page, /: 'CLP';/);
});

const legalPage = readFileSync('app/dashboard/legal/page.tsx', 'utf8');
test('legal evidence review uses open canonical cases', () => {
  assert.match(legalPage, /casesData\?\.data/);
  assert.match(legalPage, /item\.status !== 'closed'/);
  assert.match(legalPage, /Evidencia regulatoria por conciliar/);
});
