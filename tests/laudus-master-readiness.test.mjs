import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261023103000_external_master_identity_links.sql', import.meta.url), 'utf8');
const readiness = readFileSync(new URL('../lib/integrations/laudus/master-readiness.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/master-readiness/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/integrations/laudus-master-readiness-card.tsx', import.meta.url), 'utf8');

test('external master links stay outside canonical business tables', () => {
  assert.match(migration, /integration\.external_entity_links/);
  assert.match(migration, /external_id text not null/);
  assert.match(migration, /canonical_id text not null/);
  assert.match(migration, /match_method/);
  assert.doesNotMatch(migration, /alter table canonical\.(products|suppliers|assets|cost_centers)/i);
});

test('external master links are private to service role', () => {
  assert.match(migration, /revoke all on integration\.external_entity_links from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on integration\.external_entity_links to service_role/);
});

test('master readiness evaluates existing canonical masters and treats Laudus links as optional', () => {
  for (const entity of ['products', 'suppliers', 'warehouses', 'cost_centers', 'assets']) {
    assert.match(readiness, new RegExp("'" + entity + "'"));
  }
  assert.match(readiness, /external_entity_links/);
  assert.match(readiness, /catch \{/);
});

test('migration readiness endpoint is admin-only', () => {
  assert.match(route, /resolveDataHealthAccess/);
  assert.match(route, /if \(!access\.admin\)/);
  assert.match(route, /loadLaudusMasterReadiness/);
});

test('UI exposes business readiness without integration internals', () => {
  assert.match(card, /Preparación para migración Laudus/);
  assert.match(card, /Identidad preparada/);
  assert.match(card, /Vínculos Laudus/);
  assert.doesNotMatch(card, /external_id|payload_hash|raw_records|reconciliation_items/);
});
