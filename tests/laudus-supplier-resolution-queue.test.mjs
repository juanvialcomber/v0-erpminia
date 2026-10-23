import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261023114500_supplier_resolution_queue.sql', import.meta.url), 'utf8');
const helper = readFileSync(new URL('../lib/integrations/laudus/supplier-resolution-queue.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/supplier-resolution-queue/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/integrations/laudus-supplier-resolution-queue-card.tsx', import.meta.url), 'utf8');

test('supplier resolution queue is read-only and only contains unresolved names', () => {
  assert.match(migration, /supplier_resolution_status = 'unresolved'/);
  assert.match(migration, /purchase_order_count/);
  assert.doesNotMatch(migration, /insert into canonical\.suppliers|update canonical\.suppliers/i);
});

test('queue is prioritized by purchase order count and bounded', () => {
  assert.match(helper, /order\('purchase_order_count', \{ ascending: false \}\)/);
  assert.match(helper, /Math\.min\(Math\.max\(limit, 1\), 100\)/);
});

test('queue API is permission scoped and review only', () => {
  assert.match(route, /FIN_COMPRAS/);
  assert.match(route, /policy: 'review_only'/);
});

test('UI never implies automatic supplier creation or linkage', () => {
  assert.match(card, /no crea ni enlaza proveedores/);
  assert.match(card, /RUT\/código Laudus u otra evidencia determinística/);
});
