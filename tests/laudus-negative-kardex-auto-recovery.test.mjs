import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const helperPath = new URL('../lib/integrations/laudus/negative-kardex-sync.ts', import.meta.url);
const stockPath = new URL('../lib/integrations/laudus/stock-sync.ts', import.meta.url);

test('negative Kardex recovery is bounded budget-aware and fresh-only', async () => {
  const helper = await readFile(helperPath, 'utf8');

  assert.match(helper, /MAX_PRODUCTS = 10/);
  assert.match(helper, /MONTHLY_RESERVE = 200/);
  assert.match(helper, /FRESH_HOURS = 24/);
  assert.match(helper, /monthly_remaining_exact/);
  assert.match(helper, /laudus_negative_stock_positions_service_v1/);
  assert.match(helper, /laudus_product_kardex/);
  assert.match(helper, /rows\.length > 500/);
  assert.match(helper, /motil_ingest_laudus_product_kardex/);
  assert.match(helper, /canonicalMutated: false/);
  assert.match(helper, /laudusMutated: false/);
});

test('daily stock sync enriches only after successful stock staging and does not fail stock on Kardex error', async () => {
  const stock = await readFile(stockPath, 'utf8');

  assert.match(stock, /syncNegativeLaudusKardex/);
  assert.match(stock, /negative Kardex recovery failed/);
  assert.match(stock, /negativeKardex/);
  assert.match(stock, /canonicalInventoryMutated: false/);
  assert.match(stock, /laudusMutated: false/);
});
