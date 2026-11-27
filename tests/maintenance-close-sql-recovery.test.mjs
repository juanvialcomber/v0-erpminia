import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const sql = readFileSync('supabase/migrations/20261127195000_recover_preventive_close_guards.sql', 'utf8');
test('RPC keeps material reconciliation independent and verifies current fluid evidence', () => {
 assert.match(sql, /material_reconciliation_deferred/);
 assert.match(sql, /created_at > v_fluid_declaration.event_at/);
 assert.match(sql, /coalesce\(updated_at, created_at\) > v_fluid_declaration.event_at/);
 assert.match(sql, /v_stale_fluid_usage_count > 0/);
 assert.match(sql, /revoke all on function public.close_work_order_safely\(uuid\) from public, anon, authenticated/);
});
