import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(
  new URL('../lib/integrations/laudus/extended-finance.ts', import.meta.url),
  'utf8',
);
const route = readFileSync(
  new URL('../app/api/integrations/laudus/extended-finance/sync/route.ts', import.meta.url),
  'utf8',
);
const migration = readFileSync(
  new URL('../supabase/migrations/20261024161500_ingest_laudus_extended_finance.sql', import.meta.url),
  'utf8',
);

test('extended finance uses the current official Laudus read endpoints', () => {
  assert.match(helper, /\/accounting\/journal\/entries\/list/);
  assert.match(helper, /\/accounting\/bankStatements\/list/);
  assert.match(helper, /\/DTE\/pending/);
  assert.match(helper, /journalEntryId/);
  assert.match(helper, /bankStatementId/);
});

test('extended finance sync is admin gated and read-only toward Laudus', () => {
  assert.match(route, /resolveDataHealthAccess/);
  assert.match(route, /if \(!access\.admin\)/);
  assert.match(route, /motil_ingest_laudus_extended_finance/);
  assert.match(route, /mode: 'read_only'/);
  assert.match(route, /canonicalMutated: false/);
  assert.match(route, /laudusMutated: false/);
});

test('extended finance ingestion stays inside integration staging', () => {
  assert.match(migration, /integration\.laudus_accounting_entries/);
  assert.match(migration, /integration\.laudus_bank_statements/);
  assert.match(migration, /integration\.laudus_dtes/);
  assert.match(migration, /source_payload/);
  assert.doesNotMatch(
    migration,
    /insert into canonical\.|update canonical\.|insert into public\.procurement_|update public\.procurement_/i,
  );
  assert.match(migration, /canonical_mutated',false/);
  assert.match(migration, /laudus_mutated',false/);
});
