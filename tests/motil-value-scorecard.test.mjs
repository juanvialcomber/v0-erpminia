import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('app/api/admin/value-scorecard/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/admin/valor-motil/page.tsx','utf8');
const sql=fs.readFileSync('supabase/migrations/20261024014500_value_scorecard_rpc.sql','utf8');

test('MOTIL value scorecard is admin-only and separates evidence from ROI',()=>{
  assert.match(api,/ADMIN_ROLES/);
  assert.match(api,/motil_value_scorecard_preview/);
  assert.match(sql,/'accountingTruth',false/);
  assert.match(sql,/'auditedSavings',false/);
  assert.match(sql,/'matchCalibration'/);
  assert.match(sql,/'supplyOutcomes'/);
  assert.match(sql,/'valueEvidence'/);
  assert.match(page,/No ahorro auditado/);
  assert.match(page,/Gate para defender cambio de tarifa/);
});
