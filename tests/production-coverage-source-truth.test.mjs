import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const component = readFileSync('components/dashboard/produccion-dashboard.tsx', 'utf8');
test('production coverage reports observed source counts without unsupported fixed denominators', () => {
  assert.match(component, /n\(data\.quality\.sourceFiles\)\} archivos/);
  assert.match(component, /n\(data\.quality\.sourceSheets\)\} hojas/);
  assert.doesNotMatch(component, /sourceFiles\}\/7 archivos/);
  assert.doesNotMatch(component, /sourceSheets\}\/172 hojas/);
});
