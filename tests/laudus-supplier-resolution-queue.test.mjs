import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const legacyMigration = readFileSync(
  new URL('../supabase/migrations/20261023114500_supplier_resolution_queue.sql', import.meta.url),
  'utf8',
);
const bridgeMigration = readFileSync(
  new URL('../supabase/migrations/20261024162000_laudus_supplier_bridge_candidates.sql', import.meta.url),
  'utf8',
);
const summaryMigration = readFileSync(
  new URL('../supabase/migrations/20261024162500_laudus_supplier_bridge_summary.sql', import.meta.url),
  'utf8',
);
const helper = readFileSync(
  new URL('../lib/integrations/laudus/supplier-resolution-queue.ts', import.meta.url),
  'utf8',
);
const route = readFileSync(
  new URL('../app/api/integrations/laudus/supplier-resolution-queue/route.ts', import.meta.url),
  'utf8',
);
const card = readFileSync(
  new URL('../components/integrations/laudus-supplier-resolution-queue-card.tsx', import.meta.url),
  'utf8',
);

test('legacy supplier resolution queue remains read-only', () => {
  assert.match(legacyMigration, /supplier_resolution_status = 'unresolved'/);
  assert.match(legacyMigration, /purchase_order_count/);
  assert.doesNotMatch(
    legacyMigration,
    /insert into canonical\.suppliers|update canonical\.suppliers/i,
  );
});

test('supplier bridge is precomputed and tax-id verified', () => {
  assert.match(bridgeMigration, /materialized view/);
  assert.match(bridgeMigration, /canonical_supplier_id/);
  assert.match(bridgeMigration, /regexp_replace\(lower\(coalesce\(cs\.tax_id/);
  assert.match(bridgeMigration, /tax_verified_exact/);
  assert.match(bridgeMigration, /source_placeholder/);
  assert.match(bridgeMigration, /supplier_name_key = 'NULA'/);
  assert.doesNotMatch(
    bridgeMigration,
    /update canonical\.purchase_orders|insert into canonical\.purchase_orders/i,
  );
});

test('bridge facade and refresh are service-role only', () => {
  assert.match(bridgeMigration, /security_invoker = true/);
  assert.match(
    bridgeMigration,
    /revoke all on public\.laudus_supplier_bridge_candidates_service_v1 from public,anon,authenticated/,
  );
  assert.match(
    bridgeMigration,
    /grant select on public\.laudus_supplier_bridge_candidates_service_v1 to service_role/,
  );
  assert.match(
    bridgeMigration,
    /grant execute on function public\.motil_refresh_laudus_supplier_bridge\(\) to service_role/,
  );
});

test('queue helper reads bounded rows plus a one-row aggregate summary', () => {
  assert.match(helper, /laudus_supplier_bridge_candidates_service_v1/);
  assert.match(helper, /laudus_supplier_bridge_summary_service_v1/);
  assert.match(helper, /maybeSingle\(\)/);
  assert.match(helper, /Math\.min\(Math\.max\(limit, 1\), 50\)/);
  assert.doesNotMatch(helper, /\.schema\(['"]integration['"]\)/);
});

test('supplier bridge summary aggregates in Postgres instead of application memory', () => {
  assert.match(summaryMigration, /count\(\*\) filter \(where resolution_status = 'tax_verified_exact'\)/);
  assert.match(summaryMigration, /sum\(purchase_order_count\) filter/);
  assert.match(summaryMigration, /group by organization_id/);
  assert.match(summaryMigration, /grant select on public\.laudus_supplier_bridge_summary_service_v1 to service_role/);
});

test('queue API is permission scoped and review only', () => {
  assert.match(route, /FIN_COMPRAS/);
  assert.match(route, /policy: 'review_only'/);
});

test('UI distinguishes verified identity from source-quality placeholders', () => {
  assert.match(card, /Identidad de proveedores históricos/);
  assert.match(card, /RUT verificado/);
  assert.match(card, /Proveedores reales sin resolver/);
  assert.match(card, /OC placeholder de fuente/);
  assert.match(card, /La adopción canónica seguirá siendo un gate separado/);
});


test('supplier bridge human review is write-gated and non-canonical', () => {
  const reviewMigration = readFileSync(
    new URL('../supabase/migrations/20261024163500_laudus_supplier_bridge_reviews.sql', import.meta.url),
    'utf8',
  );
  const reviewRoute = readFileSync(
    new URL('../app/api/integrations/laudus/supplier-resolution-queue/review/route.ts', import.meta.url),
    'utf8',
  );

  assert.match(reviewMigration, /laudus_supplier_bridge_reviews/);
  assert.match(reviewMigration, /tax_verified_exact/);
  assert.match(reviewMigration, /motil_record_laudus_supplier_bridge_review/);
  assert.doesNotMatch(reviewMigration, /update canonical\.purchase_orders|update canonical\.suppliers/i);
  assert.match(reviewRoute, /FIN_COMPRAS, true/);
  assert.match(reviewRoute, /canonicalMutated: false/);
  assert.match(reviewRoute, /purchaseOrdersMutated: false/);
  assert.match(reviewRoute, /motil_record_laudus_supplier_bridge_review/);
  assert.match(card, /Coincide/);
  assert.match(card, /No coincide/);
  assert.match(card, /La adopción canónica seguirá siendo un gate separado/);
});
