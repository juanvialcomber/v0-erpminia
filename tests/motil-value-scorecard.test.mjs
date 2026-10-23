import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('app/api/admin/value-scorecard/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/admin/valor-motil/page.tsx','utf8');

test('MOTIL value scorecard is admin-only and separates evidence from ROI',()=>{
  assert.match(api,/ADMIN_ROLES/);
  assert.match(api,/auditedSavings:false/);
  assert.match(api,/accountingTruth:false/);
  assert.match(api,/matchCalibration/);
  assert.match(api,/supplyOutcomes/);
  assert.match(api,/valueEvidence/);
  assert.match(page,/No ahorro auditado/);
  assert.match(page,/Gate para defender cambio de tarifa/);
});
