import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const home = await readFile(new URL('../components/dashboard/dashboard-home.tsx', import.meta.url), 'utf8');

test('dashboard starts from one role-specific work inbox', () => {
  assert.match(home, /Mi trabajo/);
  assert.match(home, /\/dashboard\/acciones/);
  assert.match(home, /const tasks = \(inbox\.data\?\.tasks \|\| \[\]\)\.filter\(task => task\.responsibility === 'owner' \|\| task\.responsibility === 'escalation'\)\.slice\(0, 3\)/);
  assert.match(home, /resolveMode\(inbox\.data\?\.profile\?\.cargoName\)/);
});

test('supplemental KPIs and shortcuts are hidden until explicit expansion', () => {
  const details = home.indexOf('<details className="group rounded-lg border bg-card"');
  assert.ok(details > 0);
  assert.ok(home.indexOf('config.metrics.length > 0', details) > details);
  assert.ok(home.indexOf('config.shortcuts.map', details) > details);
  assert.ok(home.indexOf('HomeDecisionPriorities', details) > details);
  assert.match(home, /Ver más · Indicadores y accesos/);
});

test('missing role data remains an honest warning, not a zero count', () => {
  assert.match(home, /inboxUnavailable/);
  assert.match(home, /StatePanel tone="warning"/);
});
