import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const files = [
  '../app/dashboard/compras/page.tsx',
  '../app/dashboard/finanzas/page.tsx',
  '../app/dashboard/bodega/page.tsx',
  '../app/dashboard/mantenimiento/equipos/page.tsx',
];

test('Laudus readiness is driven by the shared backend source state in all prepared modules', () => {
  for (const path of files) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(source, /useDataSourceStatus/);
    assert.match(source, /sourceStatus\.source\('laudus'/);
    assert.match(source, /sourceStatus\.state\('laudus'\) === 'updated'/);
  }
});

test('source strip can surface freshness and review counts without exposing integration internals', () => {
  const strip = readFileSync(new URL('../components/data/data-source-status-strip.tsx', import.meta.url), 'utf8');
  assert.match(strip, /Actualizado \{formatUpdatedAt/);
  assert.match(strip, /reviewCount/);
  assert.doesNotMatch(strip, /raw_records|payload_hash|external_id|reconciliation_items/);
});
