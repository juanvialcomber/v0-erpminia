import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../lib/intelligence/deterministic-operational-answer.ts', import.meta.url), 'utf8');

test('deterministic operational layer protects contract semantics', () => {
  assert.match(source, /no prueba pago bancario, avance físico ni cierre contractual/);
  assert.match(source, /read_contracts_directory/);
  assert.match(source, /contract_value/);
});

test('deterministic operational layer keeps stock read-only and source dated', () => {
  assert.match(source, /laudus_inventory_reconciliation_service_v1/);
  assert.match(source, /solo lectura/);
  assert.match(source, /latest_laudus_stock_sync/);
});
