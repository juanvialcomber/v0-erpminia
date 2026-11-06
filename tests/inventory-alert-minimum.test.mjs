import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const helperUrl = new URL('../lib/inventory-alerts.ts', import.meta.url);
const sharedAlertSourceUrl = new URL('../lib/api/inventory-stock-alerts.ts', import.meta.url);
const unifiedAlertSources = [
  '../app/api/alertas/route.ts',
  '../app/api/bodega/reorder-alerts/route.ts',
  '../app/api/warehouse/reorder/route.ts',
  '../lib/api/dashboard-snapshot.ts',
];
const inventoryPageUrl = new URL('../app/dashboard/bodega/page.tsx', import.meta.url);
const inventoryIntelligenceUrl = new URL('../app/api/inventory/intelligence/route.ts', import.meta.url);

test('stock alerts require a configured positive minimum', async () => {
  const helper = await readFile(helperUrl, 'utf8');

  assert.match(helper, /Number\.isFinite\(minimum\) && minimum > 0/);
  assert.match(helper, /if \(!hasConfiguredStockMinimum\(minimumValue\)\) return false/);
});

test('canonical organizations share one paginated stock-alert source', async () => {
  const source = await readFile(sharedAlertSourceUrl, 'utf8');

  assert.match(source, /orgHasCanonicalData\(input\.organizationId\)/);
  assert.match(source, /from\('canonical_inventory_current'\)/);
  assert.match(source, /resolvedOperationalQuantity\(row\.quantity, operational\.get\(row\.id\)\)/);
  assert.match(source, /isStockBelowMinimum\(quantity, row\.min_stock\)/);
  assert.match(source, /dataSource: 'canonical'/);
  assert.match(source, /dataSource: 'warehouse'/);
  assert.match(source, /\.range\(start, start \+ PAGE_SIZE - 1\)/);
});

test('primary inventory alert surfaces use the shared source', async () => {
  const sources = await Promise.all(
    unifiedAlertSources.map(async (path) => ({
      path,
      content: await readFile(new URL(path, import.meta.url), 'utf8'),
    })),
  );

  for (const source of sources) {
    assert.match(
      source.content,
      /listInventoryStockAlerts/,
      `${source.path} must use the shared canonical stock-alert source`,
    );
  }
});

test('Bodega reads the canonical inventory intelligence endpoint', async () => {
  const page = await readFile(inventoryPageUrl, 'utf8');
  const route = await readFile(inventoryIntelligenceUrl, 'utf8');

  assert.match(page, /\/api\/inventory\/intelligence/);
  assert.match(route, /from\('inventory_intelligence_position_v1'\)/);
  assert.match(route, /from\('inventory_intelligence_overview_v1'\)/);
  assert.match(route, /canonical: true/);
});
