import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261029134500_bodega_stock_source_authority_gate.sql', import.meta.url),
  'utf8',
);

test('Bodega authority gate makes Laudus primary only when no newer unresolved source evidence exists', () => {
  assert.match(migration, /laudus_primary/);
  assert.match(migration, /review_laudus_stale/);
  assert.match(migration, /review_official_email/);
  assert.match(migration, /review_whatsapp_evidence/);
  assert.match(migration, /motil_email_source_manifest/);
  assert.match(migration, /motil_whatsapp_messages/);
  assert.match(migration, /m\.domain = 'warehouse'/);
  assert.doesNotMatch(migration, /m\.domain = 'production_stock'/);
  assert.match(migration, /Mineral\/production stock is excluded from this authority domain/);
  assert.match(migration, /ingest_state/);
  assert.match(migration, /latest_email_stock_cutoff/);
  assert.match(migration, /whatsapp_stock_evidence_since_laudus/);
  assert.match(migration, /existencia\[s\]\?/);
  assert.match(migration, /petróleo\|petroleo\|diesel\|bodega/);
  assert.match(migration, /litro\|litros\|kg\|kilo\|kilos\|unidad\|unidades/);
});

test('Bodega authority gate is a server-only read projection', () => {
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /revoke all on public\.bodega_stock_source_authority_service_v1 from public, anon, authenticated/);
  assert.match(migration, /grant select on public\.bodega_stock_source_authority_service_v1 to service_role/);
  assert.doesNotMatch(migration, /\binsert\b/i);
  assert.doesNotMatch(migration, /\bupdate\b/i);
  assert.doesNotMatch(migration, /\bdelete\b/i);
});
