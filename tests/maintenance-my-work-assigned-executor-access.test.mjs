import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/maintenance/my-work/route.ts', import.meta.url), 'utf8');

test('assigned maintenance executors can load their own work queue without role-matrix dependency', () => {
  assert.doesNotMatch(route, /requireModuleAccess/);
  assert.match(route, /getOrganizationContext\(request\)/);
  assert.match(route, /resolveMaintenanceViewerMode\(cargoName\) !== 'execution'/);
  assert.match(route, /\.eq\('profile_id', context\.userId\)/);
  assert.match(route, /\.eq\('employment_status', 'active'\)/);
  assert.match(route, /\.eq\('assigned_person_id', person\.id\)/);
  assert.match(route, /identityLinked: true/);
  assert.match(route, /canEdit: true/);
});

test('unlinked executors remain unable to mutate work', () => {
  assert.match(route, /identityLinked: false/);
  assert.match(route, /canEdit: false/);
});
