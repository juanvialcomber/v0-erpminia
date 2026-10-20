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

test('timeline defaults to one week back and one week ahead with subtle today cue', () => {
  const calendar = readFileSync('components/operational-calendar/comfortable-operational-calendar.tsx', 'utf8');
  assert.match(calendar, /anchorDate \|\| addDays\(today, -7\)/);
  assert.match(calendar, /days: 15/);
  assert.match(calendar, /setAnchorDate\(null\)/);
  assert.match(calendar, /border-orange-500\/25/);
  assert.doesNotMatch(calendar, /border-l-2 border-orange-500\/80/);
});


test('personal calendar includes work assigned to the viewer and work planned by the viewer', () => {
  const route = readFileSync('app/api/calendar/operational/route.ts', 'utf8');
  const calendar = readFileSync('components/operational-calendar/comfortable-operational-calendar.tsx', 'utf8');
  assert.match(route, /created_by_me: Boolean\(row\.created_by && row\.created_by === context\.userId\)/);
  assert.match(calendar, /const plannedByMe = Boolean\(item\.created_by_me\)/);
  assert.match(calendar, /if \(!assignedToMe && !plannedByMe && !needsMyAction\) return false/);
});


test('personal calendar surfaces actionable maintenance decisions, not only assignments', () => {
  const route = readFileSync('app/api/calendar/operational/route.ts', 'utf8');
  const calendar = readFileSync('components/operational-calendar/comfortable-operational-calendar.tsx', 'utf8');
  assert.match(route, /getMaintenanceWorkOrderCreationCapability/);
  assert.match(route, /'Programar OT'/);
  assert.match(route, /kind: 'Revisar cierre'/);
  assert.match(route, /kind: 'Revisar señal'/);
  assert.match(route, /Completar centro de costo/);
  assert.match(calendar, /const needsMyAction = Boolean\(item\.actionable_for_me\)/);
  assert.match(calendar, /Qué hacer/);
  assert.match(calendar, /Mis OT y las acciones que tengo que revisar, programar o destrabar/);
});
