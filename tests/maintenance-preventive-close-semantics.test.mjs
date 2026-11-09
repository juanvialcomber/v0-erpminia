import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261109195000_fix_preventive_close_root_cause_semantics.sql',
  'utf8',
);

test('root cause is required only for corrective work orders', () => {
  assert.match(
    migration,
    /lower\(coalesce\(v_wo\.work_type, ''\)\) in \('correctivo','corrective'\)[\s\S]*coalesce\(trim\(v_wo\.root_cause\), ''\) = ''/,
  );
  assert.doesNotMatch(
    migration,
    /lower\(coalesce\(v_wo\.work_type, ''\)\) <> 'general'[\s\S]{0,120}coalesce\(trim\(v_wo\.root_cause\), ''\) = ''/,
  );
});

test('preventive actions remain mandatory for non-general technical work', () => {
  assert.match(
    migration,
    /lower\(coalesce\(v_wo\.work_type, ''\)\) <> 'general'[\s\S]*coalesce\(trim\(v_wo\.preventive_actions\), ''\) = ''/,
  );
});

test('readiness view changes root-cause semantics without weakening other gates', () => {
  assert.match(migration, /work_order_close_readiness_v2/);
  assert.match(migration, /correctivo''::text, ''corrective''::text/);
  assert.match(
    migration,
    /lower\(coalesce\(v_wo\.work_type, ''\)\) <> 'general'[\s\S]*coalesce\(trim\(v_wo\.preventive_actions\), ''\) = ''/,
  );
  assert.match(migration, /pending_external_services/);
  assert.match(migration, /open_labor_entries/);
  assert.match(migration, /external_cost_conflict/);
});

test('close RPC keeps backend-only execution grants', () => {
  assert.match(
    migration,
    /revoke all on function public\.close_work_order_safely\(uuid\) from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.close_work_order_safely\(uuid\) to postgres, service_role/,
  );
});
