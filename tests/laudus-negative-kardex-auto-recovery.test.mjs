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
  assert.match(helper, /laudus_kardex_recovery_candidates_service_v1/);
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


test('Kardex recovery candidates include both global deficits and warehouse-only imbalances', async () => {
  const migration = await readFile(new URL('../supabase/migrations/20261108213000_expand_kardex_recovery_candidates.sql', import.meta.url), 'utf8');
  assert.match(migration, /laudus_negative_stock_positions_service_v1/);
  assert.match(migration, /warehouse_transfer_imbalance_global_positive/);
  assert.match(migration, /split_part\(d\.issue_key, ':', 2\)/);
  assert.match(migration, /upper\(p\.sku\) = upper/);
  assert.match(migration, /grant select on public\.laudus_kardex_recovery_candidates_service_v1 to service_role/);
});
