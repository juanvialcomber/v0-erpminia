import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../supabase/migrations/20261106001500_fix_preventive_close_semantics.sql', import.meta.url), 'utf8');

test('preventive OT does not require corrective root-cause fields to close', () => {
  assert.match(migration, /preventive/);
  assert.match(migration, /preventivo/);
  assert.match(migration, /work_order_close_readiness_v2/);
  assert.match(migration, /close_work_order_safely/);
  assert.match(migration, /root_cause/);
  assert.match(migration, /preventive_actions/);
  assert.match(migration, /not in \('general','preventive','preventivo'\)/);
});

test('corrective semantics remain protected', () => {
  assert.doesNotMatch(migration, /corrective.*not in \('general','preventive','preventivo'\)/);
});
