import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const routeUrl = new URL('../app/api/maintenance/work-orders/[id]/fluids/route.ts', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/20261105184000_atomic_ot_fluid_usage.sql', import.meta.url);

test('fluid use, optional waste and audit events are committed in one RPC transaction', async () => {
  const [route, sql] = await Promise.all([
    readFile(routeUrl, 'utf8'),
    readFile(migrationUrl, 'utf8'),
  ]);

  assert.match(route, /rpc\('record_work_order_fluid_usage_v1'/);
  assert.doesNotMatch(route, /\.from\('maintenance_fluid_usage_records'\)[\s\S]*\.insert\(/);
  assert.doesNotMatch(route, /\.from\('maintenance_waste_records'\)[\s\S]*\.insert\(/);
  assert.match(sql, /insert into public\.maintenance_fluid_usage_records/i);
  assert.match(sql, /insert into public\.maintenance_waste_records/i);
  assert.match(sql, /'waste_generated'/);
  assert.match(sql, /'fluid_usage_reported'/);
  assert.match(sql, /for update/i);
  assert.match(sql, /grant execute on function public\.record_work_order_fluid_usage_v1[\s\S]*to service_role/i);
  assert.match(sql, /revoke all on function public\.record_work_order_fluid_usage_v1[\s\S]*from authenticated/i);
});

test('fluid write remains executor-only and does not mutate inventory', async () => {
  const route = await readFile(routeUrl, 'utf8');

  assert.match(route, /requireAssignedMaintenanceExecution\(context, id\)/);
  assert.match(route, /if \(!execution\.ok\) return execution\.response/);
  assert.match(route, /inventoryMutated: false/);
  assert.match(route, /no descuenta stock de Bodega/);
});
