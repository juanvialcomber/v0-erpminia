import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const readinessPath = new URL('../lib/integrations/laudus/inventory-readiness.ts', import.meta.url);
const cardPath = new URL('../components/integrations/laudus-inventory-readiness-card.tsx', import.meta.url);

test('consumable reconciliation queue preserves units and ranks per SKU', async () => {
  const readiness = await readFile(readinessPath, 'utf8');

  assert.match(readiness, /operational_category', 'process_consumable'/);
  assert.match(readiness, /reconciliation_state', 'quantity_mismatch'/);
  assert.match(readiness, /unit: String\(row\.unit_of_measure/);
  assert.match(readiness, /relativeDeltaPct/);
  assert.match(readiness, /Math\.abs\(delta\) \/ Math\.abs\(laudusStock\)/);
  assert.match(readiness, /domainRank/);
  assert.doesNotMatch(readiness, /criticalConsumables[^;]*reduce\(/s);
});

test('Bodega explains that mixed units are never aggregated and offers bounded Kardex review', async () => {
  const card = await readFile(cardPath, 'utf8');

  assert.match(card, /Las cantidades no se suman entre unidades/);
  assert.match(card, /Laudus: \{count\(row\.laudusStock\)\} \{row\.unit\}/);
  assert.match(card, /MOTIL: \{count\(row\.motilStock\)\} \{row\.unit\}/);
  assert.match(card, /% vs Laudus/);
  assert.match(card, /loadKardex\(row\.productId, row\.sku\)/);
});
