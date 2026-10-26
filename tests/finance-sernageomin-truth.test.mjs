import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const summaryPage = readFileSync('app/dashboard/finanzas/page.tsx', 'utf8');
const traceabilityPage = readFileSync('app/dashboard/finanzas/trazabilidad/page.tsx', 'utf8');

test('finance summary stays composition-only and does not fabricate missing financial values', () => {
  assert.match(summaryPage, /LaudusFinanceControlCard/);
  assert.doesNotMatch(summaryPage, /Number\(value \|\| 0\)/);
  assert.doesNotMatch(summaryPage, /valorización aprobada del plan de cierre/);
  assert.doesNotMatch(summaryPage, /garantías financieras constituidas/);
});

test('closure and regulatory evidence remain linked to Legal from traceability', () => {
  assert.match(traceabilityPage, /dashboard\/legal/);
  assert.match(traceabilityPage, /Revisar evidencia legal/);
});

test('finance traceability does not infer currency without evidence', () => {
  assert.match(traceabilityPage, /if \(amount === null \|\| !code\) return '—'/);
  assert.doesNotMatch(traceabilityPage, /: 'CLP';/);
  assert.match(traceabilityPage, /Laudus conserva su moneda de origen/);
});

const legalPage = readFileSync('app/dashboard/legal/page.tsx', 'utf8');
test('legal evidence review uses open canonical cases', () => {
  assert.match(legalPage, /casesData\?\.data/);
  assert.match(legalPage, /item\.status !== 'closed'/);
  assert.match(legalPage, /Evidencia regulatoria por conciliar/);
});
