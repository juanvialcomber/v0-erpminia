import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readinessPath = new URL('../lib/integrations/laudus/inventory-readiness.ts', import.meta.url);
const cardPath = new URL('../components/integrations/laudus-inventory-readiness-card.tsx', import.meta.url);

test('negative Laudus positions expose the exact product id for bounded Kardex review', async () => {
  const readiness = await readFile(readinessPath, 'utf8');

  assert.match(readiness, /product_external_id/);
  assert.match(readiness, /productId: String\(row\.product_external_id/);
  assert.match(readiness, /laudus_negative_stock_positions_service_v1/);
});

test('Bodega reuses the existing admin-only Kardex endpoint one SKU at a time', async () => {
  const card = await readFile(cardPath, 'utf8');

  assert.match(card, /\/api\/integrations\/laudus\/kardex-sync/);
  assert.match(card, /JSON\.stringify\(\{ productId \}\)/);
  assert.match(card, /Kardex cargado/);
  assert.match(card, /Requiere permiso de administración/);
  assert.match(card, /disabled=\{!row\.productId \|\| Boolean\(kardexLoading\)\}/);
});
