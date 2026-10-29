import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(new URL('../app/api/data-quality/reconciliation/route.ts', import.meta.url), 'utf8');
const migration = readFileSync(new URL('../supabase/migrations/20261029123500_extend_data_reconciliation_entity_types.sql', import.meta.url), 'utf8');

const routeEntityTypes = [
  'product',
  'supplier',
  'asset',
  'person',
  'inventory',
  'work_order',
  'purchase_order',
  'invoice',
  'cost_center',
  'warehouse',
  'external_source',
];

test('data reconciliation schema accepts every entity type emitted by the route', () => {
  for (const entityType of routeEntityTypes) {
    assert.match(route, new RegExp(entityType));
    assert.match(migration, new RegExp(`'${entityType}'::text`));
  }
});

test('entity type extension only broadens the review check constraint', () => {
  assert.match(migration, /drop constraint if exists data_reconciliation_reviews_entity_type_check/);
  assert.match(migration, /add constraint data_reconciliation_reviews_entity_type_check/);
  assert.doesNotMatch(migration, /delete\s+from/i);
  assert.doesNotMatch(migration, /update\s+/i);
  assert.doesNotMatch(migration, /drop\s+table/i);
});
