import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261023113000_purchase_order_reconciliation_preview.sql', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../lib/integrations/laudus/procurement-reconciliation.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/procurement-reconciliation/route.ts', import.meta.url), 'utf8');

test('purchase order reconciliation preview is read-only and deterministic', () => {
  assert.match(migration, /create or replace view integration\.purchase_order_reconciliation_preview_v1/);
  assert.match(migration, /exact_unique_name/);
  assert.match(migration, /line_consensus/);
  assert.match(migration, /unknown_code/);
  assert.match(migration, /fully_resolvable/);
  assert.doesNotMatch(migration, /update canonical\.purchase_orders|insert into canonical\.purchase_orders/i);
});

test('supplier matching requires exact unique normalized names', () => {
  assert.match(migration, /supplier_count = 1/);
  assert.match(migration, /upper\(regexp_replace/);
});

test('cost center matching requires consensus, deterministic prefix parsing and canonical validation', () => {
  assert.match(migration, /distinct_cost_centers = 1/);
  assert.match(migration, /regexp_match\(consensus_raw/);
  assert.match(migration, /canonical\.cost_centers/);
  assert.match(migration, /cc\.id is not null/);
});

test('preview endpoint is permission scoped and explicitly non-mutating', () => {
  assert.match(route, /FIN_COMPRAS/);
  assert.match(route, /policy: 'preview_only'/);
  assert.match(helper, /unknownCode/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('runtime reads the public server-only service view, never the private integration schema', () => {
  assert.match(helper, /purchase_order_reconciliation_preview_service_v1/);
  assert.doesNotMatch(helper, /\.schema\(['"]integration['"]\)/);
});
