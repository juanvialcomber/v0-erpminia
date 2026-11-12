import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { chileTodayISO, sourceAgeDays, sourceFreshnessStatus } from '../lib/production/source-age.mjs';

test('production source age distinguishes October cutoff from older historical flow', () => {
  assert.equal(sourceAgeDays('2026-10-27', '2026-11-12'), 16);
  assert.equal(sourceAgeDays('2026-08-18', '2026-11-12'), 86);
  assert.equal(sourceFreshnessStatus(16), 'outdated');
  assert.equal(sourceFreshnessStatus(0), 'recent');
  assert.equal(sourceFreshnessStatus(7), 'recent');
  assert.equal(sourceFreshnessStatus(8), 'outdated');
});

test('production source age does not mistake absent, invalid or future cutoffs for current data', () => {
  assert.equal(sourceAgeDays(null, '2026-11-12'), null);
  assert.equal(sourceAgeDays('2026-02-30', '2026-11-12'), null);
  assert.equal(sourceFreshnessStatus(null), 'unknown');
  assert.equal(sourceFreshnessStatus(sourceAgeDays('2026-11-13', '2026-11-12')), 'future');
  assert.equal(chileTodayISO(new Date('2026-11-12T02:00:00Z')), '2026-11-11');
});

test('production landing keeps dates and review queues separate without fabricated totals', () => {
  const dashboard = readFileSync(new URL('../components/dashboard/produccion-dashboard.tsx', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../components/production/production-source-snapshot.tsx', import.meta.url), 'utf8');
  const route = readFileSync(new URL('../app/api/produccion/source-cutoff/route.ts', import.meta.url), 'utf8');
  assert.match(dashboard, /sourceAgeDays/);
  assert.match(dashboard, /Fuentes por actualizar/);
  assert.match(dashboard, /hasPendingReview/);
  assert.doesNotMatch(dashboard, /const reviewTotal\s*=/);
  assert.match(dashboard, /label:'Con datos'/);
  assert.match(source, /stats\.cutoff/);
  assert.match(source, /stock\.cutoff/);
  assert.match(source, /No equivalen a la operación de hoy/);
  assert.match(route, /asOfChileDate:chileTodayISO\(\)/);
});
