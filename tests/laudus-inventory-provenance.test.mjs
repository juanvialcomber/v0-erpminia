import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const lib=fs.readFileSync('lib/integrations/laudus/inventory-readiness.ts','utf8');
const ui=fs.readFileSync('components/integrations/laudus-inventory-readiness-card.tsx','utf8');

test('inventory readiness separates Laudus staging from MOTIL operational movements',()=>{
  assert.match(lib,/laudus_product_stock/);
  assert.match(lib,/laudus_product_kardex/);
  assert.match(lib,/motilMovementCount/);
  assert.doesNotMatch(lib,/movementCount: movements/);
});

test('inventory UI does not claim Laudus movement history is already integrated',()=>{
  assert.match(ui,/historial de movimientos Laudus todavía no está integrado/i);
  assert.match(ui,/Movimientos MOTIL/);
  assert.match(ui,/Saldo Laudus/);
  assert.match(ui,/Kardex/);
});
