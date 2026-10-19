import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../supabase/migrations/20261019154000_work_order_timer_records_first_start.sql', import.meta.url),
  'utf8',
);

test('timer records the first real execution start without overwriting it on later actions', () => {
  assert.match(migration, /when p_action = 'play' and start_date is null then \(v_now at time zone 'UTC'\)/);
  assert.match(migration, /else start_date/);
  assert.doesNotMatch(migration, /update public\.maintenance_work_orders\s+set start_date[\s\S]+where start_date is null;/);
});

test('timer start-date fix preserves pause reason, second precision and service-role boundary', () => {
  assert.match(migration, /v_pause_reason/);
  assert.match(migration, /total_timer_seconds = v_total_seconds/);
  assert.match(migration, /insert into public\.work_order_events/);
  assert.match(migration, /revoke all on function public\.update_work_order_timer[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.update_work_order_timer[\s\S]*to service_role/);
});
