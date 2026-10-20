import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const route = await readFile(new URL('../app/api/maintenance/control-center/route.ts', import.meta.url), 'utf8');
const home = await readFile(new URL('../components/dashboard/maintenance-home.tsx', import.meta.url), 'utf8');
const dictionaries = await readFile(new URL('../lib/i18n/dictionaries.ts', import.meta.url), 'utf8');

test('overdue assigned OTs with no execution stay out of closure evidence flow', () => {
  assert.match(route, /const overdueUnstartedOrders = operationalOrderRows\.filter/);
  assert.match(route, /timerStatus === 'idle'/);
  assert.match(route, /timerSeconds <= 0/);
  assert.match(route, /actualHours <= 0/);
  assert.match(route, /kind: 'execution_due'/);
  assert.match(route, /if \(overdueUnstartedIds\.has\(String\(row\.work_order_id\)\)\) continue;/);
});

test('planning and leadership expose overdue execution as its own operational action', () => {
  assert.match(home, /execution_due: \{ icon: Clock3, variant: 'destructive' \}/);
  assert.match(home, /planningKinds[\s\S]*'execution_due'/);
  assert.match(home, /leadershipKinds[\s\S]*'execution_due'/);
  assert.match(dictionaries, /execution_due: 'Ejecución vencida'/);
  assert.match(dictionaries, /execution_due: 'Overdue execution'/);
});
