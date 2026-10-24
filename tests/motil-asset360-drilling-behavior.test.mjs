import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

// Exercise actual extracted source expressions with synthetic results, never live Supabase.
const source = readFileSync(new URL('../app/api/maintenance/assets/[id]/economic-operational-history/route.ts', import.meta.url), 'utf8');
const fatal = source.match(/const sourceError = ([^;]+);/);
const unavailable = source.match(/const drillingSourceUnavailable = ([^;]+);/);
const reports = source.match(/const reports = ([^;]+);/);
assert.ok(fatal && unavailable && reports, 'Source expressions should remain discoverable');

function evaluate({ drillingError = null, ledgerRows = [{ amount: 125000, recognition_status: 'recognized' }], assetError = null }) {
  const context = {
    assetResult: { error: assetError }, reliabilityResult: { error: null }, rootCausesResult: { error: null },
    ordersResult: { error: null }, preventiveResult: { error: null }, runtimeResult: { error: null },
    operationalReportsResult: { error: drillingError, data: drillingError ? null : [{ operation_date: '2026-10-01', drilled_meters: 20 }] },
    ledgerResult: { rows: ledgerRows },
  };
  const expression = [`const sourceError = ${fatal[1]};`,`const drillingSourceUnavailable = ${unavailable[1]};`,`const reports = ${reports[1]};`,
    '({ sourceError, drillingSourceUnavailable, reports, ledger: ledgerResult.rows })'].join('\n');
  return vm.runInNewContext(expression, context);
}

test('drilling source failure preserves financial ledger and flags unavailable', () => {
  const data = evaluate({ drillingError: { message: 'permission denied' } });
  assert.equal(data.sourceError, null);
  assert.equal(data.drillingSourceUnavailable, true);
  assert.equal(data.reports.length, 0);
  assert.equal(data.ledger[0].amount, 125000);
});

test('successful drilling source keeps its evidence', () => {
  const data = evaluate({});
  assert.equal(data.drillingSourceUnavailable, false);
  assert.equal(data.reports.length, 1);
  assert.equal(data.reports[0].drilled_meters, 20);
});

test('failure in required source still blocks invalid economic response', () => {
  const data = evaluate({ assetError: { message: 'asset query failed' } });
  assert.equal(data.sourceError.message, 'asset query failed');
});
