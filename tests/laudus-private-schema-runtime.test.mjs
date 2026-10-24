import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const roots = [
  new URL('../app/api/integrations/laudus/', import.meta.url),
  new URL('../lib/integrations/laudus/', import.meta.url),
];

function filesUnder(rootUrl) {
  const root = rootUrl.pathname;
  const results = [];

  function visit(path) {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      const stat = statSync(full);
      if (stat.isDirectory()) visit(full);
      else if (/\.(ts|tsx)$/.test(name)) results.push(full);
    }
  }

  visit(root);
  return results;
}

test('Laudus runtime never addresses private integration or canonical schemas through Data API', () => {
  const offenders = [];

  for (const root of roots) {
    for (const path of filesUnder(root)) {
      const content = readFileSync(path, 'utf8');
      if (
        content.includes(".schema('integration')") ||
        content.includes('.schema("integration")') ||
        content.includes(".schema('canonical')") ||
        content.includes('.schema("canonical")')
      ) {
        offenders.push(path);
      }
    }
  }

  assert.deepEqual(offenders, []);
});


test('Laudus runtime uses the approved service facades for private evidence', () => {
  const runtime = roots
    .flatMap(filesUnder)
    .map((path) => readFileSync(path, 'utf8'))
    .join('\n');

  for (const facade of [
    'laudus_source_status_service_v1',
    'laudus_purchase_invoice_payment_status_service_v1',
    'canonical_products_service_v1',
    'canonical_suppliers_service_v1',
    'canonical_purchase_orders_service_v1',
    'canonical_purchase_order_lines_service_v1',
    'canonical_cost_centers_service_v1',
    'canonical_assets_service_v1',
    'laudus_warehouses_service_v1',
    'purchase_order_reconciliation_preview_service_v1',
    'laudus_supplier_bridge_candidates_service_v1',
    'laudus_supplier_bridge_summary_service_v1',
  ]) {
    assert.ok(runtime.includes(facade), `Missing runtime facade: ${facade}`);
  }
});
