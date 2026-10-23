import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api=fs.readFileSync('app/api/admin/value-scorecard/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/admin/valor-motil/page.tsx','utf8');

test('value scorecard compares persisted snapshots without inventing ROI',()=>{
  assert.match(api,/baseline30/);
  assert.match(api,/comparisonBase/);
  assert.match(api,/commercialEvidence/);
  assert.match(api,/new Date\(latest\.snapshot_date/);
  assert.match(page,/Comparación comercial del período/);
  assert.match(page,/Todavía no existe delta observado/);
  assert.doesNotMatch(page,/ROI generado/);
});
