import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/maintenance/control-center/route.ts', import.meta.url), 'utf8');

test('planning derives assignment work from canonical open operational orders', () => {
  assert.match(route, /select\('id,work_order_number,title,canonical_asset_id,assigned_person_id,[^']*scheduled_date[^']*timer_status[^']*total_timer_seconds[^']*actual_duration_hours[^']*'\)/);
  assert.match(route, /unassignedOperationalOrders = operationalOrderRows\.filter\(\(row:any\) => !row\.assigned_person_id\)/);
  assert.match(route, /kind: 'assignment_needed'/);
  assert.match(route, /Asignar responsable/);
  assert.match(route, /no puede iniciar ejecución hasta quedar vinculada a una persona operativa/);
  assert.match(route, /unassignedOpenWorkOrders: unassignedOperationalOrders\.length/);
});

test('assignment attention remains advisory and routes to the existing work-order detail', () => {
  assert.match(route, /href: `\/dashboard\/mantenimiento\/ordenes-trabajo\/\$\{encodeURIComponent\(String\(row\.id\)\)\}`/);
  assert.doesNotMatch(route, /assigned_person_id:\s*[^,}]+/);
  assert.doesNotMatch(route, /\.update\(/);
});
