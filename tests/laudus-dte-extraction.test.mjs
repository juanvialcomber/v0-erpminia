import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/integrations/laudus/client.ts', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../lib/integrations/laudus/dte-sync.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../app/api/integrations/laudus/dte-pending-sync/route.ts', import.meta.url), 'utf8');

test('Laudus client permits DTE only inside the existing read-only allowlist', () => {
  assert.equal((client.match(/path\.startsWith\('\/DTE\/'\)/g) || []).length >= 2, true);
  assert.doesNotMatch(client, /createLaudusDte|updateLaudusDte|deleteLaudusDte/);
});

test('pending DTE extraction is bounded, stages through existing finance RPC, and never mutates Laudus', () => {
  assert.match(sync, /getLaudus\('\/DTE\/pending'\)/);
  assert.match(sync, /rows\.length > 1000/);
  assert.match(sync, /exceeds safe staging limit/);
  assert.doesNotMatch(sync, /slice\(0, 1000\)/);
  assert.match(sync, /motil_ingest_laudus_extended_finance/);
  assert.match(sync, /p_dtes: rows/);
  assert.match(sync, /stagingOnly: true/);
  assert.match(sync, /laudusMutated: false/);
});

test('DTE sync is admin-only and usage-tracked without automatic scheduling', () => {
  assert.match(api, /resolveDataHealthAccess/);
  assert.match(api, /access\.admin/);
  assert.match(api, /withLaudusApiUsageTracking/);
});

