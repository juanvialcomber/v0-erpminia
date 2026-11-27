import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('equipment detail does not advertise edit access before verified maintenance permission is ready', async () => {
  const page = await readFile(new URL('../app/dashboard/mantenimiento/equipos/page.tsx', import.meta.url), 'utf8');

  assert.match(page, /useModuleAccess/);
  assert.match(page, /ready && canEdit\('mant_operaciones'\)/);
  assert.doesNotMatch(page, /canEdit=\{true\}/);
});
