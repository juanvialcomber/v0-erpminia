import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const eam = await readFile(new URL('../app/api/maintenance/eam-readiness/route.ts', import.meta.url), 'utf8');

test('EAM readiness rejects SR instead of treating the access-level string as truthy authorization', () => {
  assert.match(eam, /getModuleAccessLevel/);
  assert.match(eam, /accessLevel === 'SR'/);
  assert.doesNotMatch(eam, /if \(!accessLevel\)/);
});
