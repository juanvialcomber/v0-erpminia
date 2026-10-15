import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const global = readFileSync('app/dashboard/tareas/page.tsx','utf8');
const sustainability = readFileSync('app/dashboard/sostenibilidad/calendario/page.tsx','utf8');
test('global and sustainability calendar render the same continuous timeline', () => {
  assert.match(global, /ComfortableOperationalCalendar/);
  assert.match(sustainability, /ComfortableOperationalCalendar/);
  assert.doesNotMatch(global, /components\/calendar\/operational-calendar/);
});
test('canonical calendar retains source filters and timeline API', () => {
  const component = readFileSync('components/operational-calendar/comfortable-operational-calendar.tsx','utf8');
  assert.match(component, /\/api\/calendar\/operational/);
  assert.match(component, /CalendarScope/);
  assert.match(component, /CalendarPeriod/);
});

test('server filters timeline records by assigned module permissions', () => {
  const route = readFileSync('app/api/calendar/operational/route.ts', 'utf8');
  assert.match(route, /getUserModuleAccess/);
  assert.match(route, /allowedSources/);
  assert.match(route, /items\.filter\(item => allowedSources\[item\.source\]\)/);
  assert.match(route, /data: visibleItems/);
});

test('timeline defaults to current and next work week with subtle today cue', () => {
  const calendar = readFileSync('components/operational-calendar/comfortable-operational-calendar.tsx', 'utf8');
  assert.match(calendar, /anchorDate \|\| startOfChileanWorkWeek\(today\)/);
  assert.match(calendar, /getUTCDay\(\)/);
  assert.match(calendar, /setAnchorDate\(null\)/);
  assert.match(calendar, /border-orange-500\/25/);
  assert.doesNotMatch(calendar, /border-l-2 border-orange-500\/80/);
});
