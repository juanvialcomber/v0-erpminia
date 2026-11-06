import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../app/dashboard/mantenimiento/movil/page.tsx', import.meta.url), 'utf8');
const canonical = await readFile(new URL('../components/maintenance/mobile-terrain-panel.tsx', import.meta.url), 'utf8');
const legacy = await readFile(new URL('../components/maintenance/maintenance-mobile-panel.tsx', import.meta.url), 'utf8');

test('mechanic mobile route uses canonical assigned-work surface, not the legacy parallel workflow', () => {
  assert.match(page, /MobileTerrainPanel/);
  assert.doesNotMatch(page, /MaintenanceMobilePanel/);
  assert.match(canonical, /\/api\/maintenance\/my-work/);
  assert.match(canonical, /\/api\/maintenance\/viewer-context/);
  assert.doesNotMatch(canonical, /\/api\/mantenimiento\/tiempo/);
  assert.doesNotMatch(canonical, /Dashboard gerencial/);
  assert.doesNotMatch(canonical, /Ver planificación/);
  assert.doesNotMatch(canonical, /Horas trabajadas/);
});

test('legacy mobile panel remains non-canonical and must not be mounted from mechanic route', () => {
  assert.match(legacy, /\/api\/mantenimiento\/tiempo/);
  assert.match(legacy, /Horas trabajadas/);
  assert.doesNotMatch(page, /maintenance-mobile-panel/);
});
