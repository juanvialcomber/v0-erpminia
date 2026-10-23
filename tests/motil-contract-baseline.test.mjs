import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const baseline=fs.readFileSync('lib/commercial/motil-contract-baseline.ts','utf8');
const api=fs.readFileSync('app/api/admin/value-scorecard/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/admin/valor-motil/page.tsx','utf8');

test('contract baseline distinguishes draft, proposal and additive capabilities',()=>{
  assert.match(baseline,/signedFinalLocated: false/);
  assert.match(baseline,/Mantención y maquinaria/);
  assert.match(baseline,/developmentNetClp: 24000000/);
  assert.match(baseline,/monthlySupportNetClp: 1000000/);
  assert.match(baseline,/documentaryTensions/);
  assert.match(api,/MOTIL_CONTRACT_BASELINE/);
  assert.match(page,/Contrato y propuesta vs evolución/);
  assert.match(page,/falta localizar la versión final firmada/);
});
