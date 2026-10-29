import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261029225000_laudus_negative_stock_positions.sql', import.meta.url);
const readinessPath = new URL('../lib/integrations/laudus/inventory-readiness.ts', import.meta.url);
const cardPath = new URL('../components/integrations/laudus-inventory-readiness-card.tsx', import.meta.url);

test('negative Laudus positions stay read-only and warehouse-localized', async () => {
  const migration = await readFile(migrationPath, 'utf8');

  assert.match(migration, /laudus_negative_stock_positions_service_v1/);
  assert.match(migration, /warehouse_external_id/);
  assert.match(migration, /warehouse_stock < 0/);
  assert.match(migration, /r\.laudus_stock < 0/);
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /revoke all .* from public, anon, authenticated/i);
  assert.match(migration, /grant select .* to service_role/i);
  assert.doesNotMatch(migration, /\binsert\b/i);
  assert.doesNotMatch(migration, /\bupdate\b/i);
  assert.doesNotMatch(migration, /\bdelete\b/i);
});

test('Bodega readiness exposes the warehouse causing each negative Laudus position', async () => {
  const readiness = await readFile(readinessPath, 'utf8');
  const card = await readFile(cardPath, 'utf8');

  assert.match(readiness, /laudus_negative_stock_positions_service_v1/);
  assert.match(readiness, /negativePositions/);
  assert.match(readiness, /negativeWarehouses/);
  assert.match(card, /La excepción se localiza por bodega/);
  assert.match(card, /MOTIL no corrige el saldo/);
  assert.match(card, /warehouseName/);
  assert.match(card, /warehouseStock/);
});
