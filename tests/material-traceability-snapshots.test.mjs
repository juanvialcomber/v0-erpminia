import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024004000_material_traceability_snapshots.sql','utf8');
const route=fs.readFileSync('app/api/maintenance/material-traceability-readiness/route.ts','utf8');
const component=fs.readFileSync('components/maintenance/material-traceability-readiness.tsx','utf8');
const cron=fs.readFileSync('app/api/cron/value-scorecard-daily/route.ts','utf8');

test('material traceability snapshots are backend-only and time series aware',()=>{
  assert.match(migration,/maintenance_material_traceability_snapshots/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all .* public,anon,authenticated/);
  assert.match(migration,/motil_capture_material_traceability_snapshot/);
  assert.match(migration,/motil_material_traceability_history/);
  assert.match(route,/motil_material_traceability_history/);
});

test('daily value cron captures material traceability using Chile business date',()=>{
  assert.match(cron,/chileBusinessDate/);
  assert.match(cron,/motil_capture_material_traceability_snapshot/);
  assert.match(cron,/p_snapshot_date: snapshotDate/);
});

test('readiness UI separates baseline trend from economic impact',()=>{
  assert.match(component,/Baseline capturado/);
  assert.match(component,/Evolución 30 días/);
  assert.match(component,/no equivale a ahorro/);
});