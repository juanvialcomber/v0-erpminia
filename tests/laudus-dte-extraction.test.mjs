import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const client = readFileSync(new URL('../lib/integrations/laudus/client.ts', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../lib/integrations/laudus/dte-sync.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../app/api/integrations/laudus/dte-pending-sync/route.ts', import.meta.url), 'utf8');
const cron = readFileSync(new URL('../app/api/cron/laudus-dtes-daily/route.ts', import.meta.url), 'utf8');
const coverage = readFileSync(new URL('../app/api/integrations/laudus/coverage/route.ts', import.meta.url), 'utf8');
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

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

test('DTE sync has admin and cron entrypoints with API usage tracking', () => {
  assert.match(api, /resolveDataHealthAccess/);
  assert.match(api, /access\.admin/);
  assert.match(api, /withLaudusApiUsageTracking/);
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /withLaudusApiUsageTracking/);
  assert.match(vercel, /\/api\/cron\/laudus-dtes-daily/);
  assert.match(vercel, /40 8 \* \* \*/);
});

test('Laudus coverage uses public DTE and credit-note views while private Kardex stays unverifiable', () => {
  assert.match(coverage, /laudus_dtes_service_v1/);
  assert.match(coverage, /laudus_credit_notes_service_v1/);
  assert.match(coverage, /\['product_kardex', 'Kardex consultado', null\]/);
  assert.doesNotMatch(coverage, /laudus_product_kardex/);
});
