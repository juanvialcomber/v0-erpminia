import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const productApi = readFileSync(new URL('../app/api/inventory/products/[id]/route.ts', import.meta.url), 'utf8');
const kardexApi = readFileSync(new URL('../app/api/integrations/laudus/kardex-sync/route.ts', import.meta.url), 'utf8');
const kardexCard = readFileSync(new URL('../components/integrations/laudus-product-kardex-card.tsx', import.meta.url), 'utf8');
const productPage = readFileSync(new URL('../app/dashboard/bodega/productos/[id]/page.tsx', import.meta.url), 'utf8');
const bankSync = readFileSync(new URL('../lib/integrations/laudus/bank-statement-sync.ts', import.meta.url), 'utf8');
const bankApi = readFileSync(new URL('../app/api/integrations/laudus/bank-statements-sync/route.ts', import.meta.url), 'utf8');
const bankCard = readFileSync(new URL('../components/integrations/laudus-bank-reconciliation-card.tsx', import.meta.url), 'utf8');

test('product traceability exposes only matched Laudus product identity', () => {
  assert.match(productApi, /laudus_products/);
  assert.match(productApi, /canonical_product_id/);
  assert.match(productApi, /reconciliation_status', 'matched'/);
  assert.match(productApi, /laudusLink/);
});

test('contextual kardex is explicit, bounded and staging-only', () => {
  assert.match(kardexApi, /\/production\/products\/\$\{encodeURIComponent\(productId\)\}\/kardex/);
  assert.match(kardexApi, /rows\.length > 500/);
  assert.match(kardexApi, /rows: rows\.slice\(-50\)/);
  assert.match(kardexApi, /stagingOnly: true/);
  assert.match(kardexApi, /canonicalMutated: false/);
  assert.match(kardexApi, /laudusMutated: false/);
  assert.match(kardexCard, /Consulta el historial sólo cuando lo necesitas/);
  assert.match(productPage, /LaudusProductKardexCard/);
});

test('bank statements use one recent list and normalize nested or flattened bank fields', () => {
  assert.match(bankSync, /limit: 25/);
  assert.match(bankSync, /'bank\.bankId'/);
  assert.match(bankSync, /'bank\.currencyCode'/);
  assert.match(bankSync, /function readField/);
  assert.match(bankSync, /normalizeStatement/);
  assert.match(bankSync, /canonicalMutated: false/);
  assert.match(bankSync, /laudusMutated: false/);
});

test('Treasury bank refresh is admin controlled and keeps Laudus read-only', () => {
  assert.match(bankApi, /resolveDataHealthAccess/);
  assert.match(bankApi, /access\.admin/);
  assert.match(bankApi, /withLaudusApiUsageTracking/);
  assert.match(bankApi, /stagingOnly: true/);
  assert.match(bankApi, /laudusMutated: false/);
  assert.match(bankCard, /Actualizar cartolas/);
  assert.match(bankCard, /cartolas leídas/);
  assert.match(bankCard, /fecha más reciente recibida/);
  assert.match(bankCard, /bank-statements-sync/);
});
