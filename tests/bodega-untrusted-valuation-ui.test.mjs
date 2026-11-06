import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const dashboard = await readFile(new URL('../components/dashboard/bodega-dashboard.tsx', import.meta.url), 'utf8');

test('legacy bodega dashboard does not publish monetary certainty while valuation is under review', () => {
  assert.match(dashboard, /Valor del inventario/);
  assert.match(dashboard, /En conciliación/);
  assert.match(dashboard, /Los costos unitarios requieren revisión antes de publicar una valorización/);
  assert.match(dashboard, />En revisión<\/td>/);
  assert.match(dashboard, />En conciliación<\/td>/);
  assert.doesNotMatch(dashboard, /const totalValue = normalizedInventory\.reduce/);
  assert.doesNotMatch(dashboard, /formatCurrency\(\(item\.quantity \|\| 0\) \* \(item\.unit_cost \|\| 0\)\)/);
  assert.doesNotMatch(dashboard, /Inventario valorizado/);
});
