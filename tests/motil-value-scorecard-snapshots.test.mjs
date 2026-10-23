import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261024021500_value_scorecard_snapshots.sql','utf8');
const cron=fs.readFileSync('app/api/cron/value-scorecard-daily/route.ts','utf8');
const api=fs.readFileSync('app/api/admin/value-scorecard/route.ts','utf8');
const vercel=fs.readFileSync('vercel.json','utf8');

test('value scorecard snapshots are backend-only and idempotent',()=>{
  assert.match(sql,/unique \(organization_id, snapshot_date\)/);
  assert.match(sql,/on conflict \(organization_id,snapshot_date\)/);
  assert.match(sql,/revoke all on function public\.motil_capture_value_scorecard_snapshot/);
  assert.match(sql,/grant execute .*service_role/);
  assert.match(sql,/do not backfill hypothetical ROI/);
});

test('daily value snapshot reuses protected cron pattern',()=>{
  assert.match(cron,/CRON_SECRET/);
  assert.match(cron,/America\/Santiago/);
  assert.match(cron,/motil_capture_value_scorecard_snapshot/);
  assert.match(vercel,/\/api\/cron\/value-scorecard-daily/);
  assert.match(api,/motil_value_scorecard_history_preview/);
});
