import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('value scorecard keeps evidence and workflow maturity explicit', () => {
  const route = fs.readFileSync('app/api/value/scorecard/route.ts', 'utf8');
  const page = fs.readFileSync('app/dashboard/valor/page.tsx', 'utf8');

  assert.match(route, /motil_value_scorecard_preview/);
  assert.match(route, /motil_value_scorecard_history_preview/);
  assert.match(route, /finanzas-supervisor/);
  assert.match(page, /Valor demostrado/);
  assert.match(page, /Impacto E3 observado/);
  assert.match(page, /No se presenta exposición ni monto involucrado como ahorro/);
  assert.match(page, /Qué falta para escalar/);
  assert.match(page, /Estas cifras demuestran cobertura E1/);
});
