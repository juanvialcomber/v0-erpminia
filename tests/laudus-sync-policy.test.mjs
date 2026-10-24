import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../lib/integrations/laudus/sync-policy.ts', import.meta.url), 'utf8');

test('Laudus sync policies bound every page and every run', () => {
  assert.match(source, /pageSize: 100/);
  assert.match(source, /maxPagesPerRun:/);
  assert.doesNotMatch(source, /pageSize: (?:[5-9]\d\d|\d{4,})/);
});

test('auth failures fail closed instead of retrying credentials indefinitely', () => {
  assert.match(source, /status === 401 \|\| status === 403/);
  assert.match(source, /retry: false/);
  assert.match(source, /terminal: true/);
});

test('rate limits and upstream failures use capped exponential backoff', () => {
  assert.match(source, /status === 429 \|\| status >= 500/);
  assert.match(source, /Math\.min\(60_000/);
});

test('delta windows deliberately overlap to tolerate late-arriving provider updates', () => {
  assert.match(source, /overlapMinutes:/);
  assert.match(source, /fullSnapshotHours:/);
});


test('Laudus authority policy always requires human review before canonical overwrite', () => {
  assert.match(source, /upstreamMode: 'read_only'/);
  assert.match(source, /autoMergeCanonical: false/);
  assert.match(source, /autoOverwriteOperationalTruth: false/);
  assert.match(source, /humanReviewRequiredForConflicts: true/);
  assert.match(source, /laudusFinancialAuthority: true/);
  assert.match(source, /motilOperationalAuthority: true/);
});
