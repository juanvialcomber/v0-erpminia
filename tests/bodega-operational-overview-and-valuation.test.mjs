import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const route = await readFile(new URL('../app/api/inventory/intelligence/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/bodega/page.tsx', import.meta.url), 'utf8');

test('inventory overview is corrected with operational Laudus quantities without rewriting source tables', () => {
  assert.match(route, /function adjustedOverview/);
  assert.match(route, /bodega_inventory_operational_service_v1/);
  assert.match(route, /operational_resolution.*legacy_motil_stale/);
  assert.match(route, /operational_resolution.*laudus_only_current/);
  assert.match(route, /overview: adjustedOverview/);
  assert.match(route, /overview\.total_stock_value \+= \(after - before\) \* row\.unit_cost/);
  assert.match(route, /if \(quantity < 0\) return 'negative'/);
  assert.match(route, /if \(before > 0 && after <= 0\) overview\.products_with_stock -= 1/);
  assert.match(route, /if \(before <= 0 && after > 0\) overview\.products_with_stock \+= 1/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.insert\(/);
});

test('bodega does not publish trusted inventory valuation while cost reconciliation remains open', () => {
  assert.match(route, /trusted: false/);
  assert.match(route, /costos de Bodega siguen pendientes de conciliación completa/);
  assert.match(page, /const valuationTrusted = valuation\?\.trusted === true/);
  assert.match(page, /En conciliación/);
  assert.match(page, /Los costos requieren conciliación antes de publicar una valorización total/);
});


test('negative operational quantity is a separate state and never counts as stock on hand', () => {
  assert.match(route, /if \(quantity < 0\) return 'negative'/);
  assert.match(route, /if \(quantity <= 0\) return 'out_of_stock'/);
  assert.match(route, /before <= 0 && after > 0/);
  assert.doesNotMatch(route, /after >= 0\) overview\.products_with_stock/);
});
