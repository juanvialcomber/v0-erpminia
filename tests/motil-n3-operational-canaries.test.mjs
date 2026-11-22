import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateMotilOperationalCanaries } from '../lib/intelligence/motil-operational-canaries.mjs';

const NOW = '2026-11-22T18:20:00.000Z';
const order = (id, overrides = {}) => ({
  id,
  work_order_number: id,
  status: 'in_progress',
  timer_status: 'idle',
  timer_start_time: null,
  assigned_person_id: null,
  ...overrides,
});
const run = (rows, extras = {}) => evaluateMotilOperationalCanaries({
  workOrders: rows,
  totalWorkOrders: rows.length,
  stockSource: { state: 'observed', syncedAt: '2026-11-22T18:10:00.000Z' },
  coreErrorSource: { state: 'observed', rows: [] },
  now: NOW,
  ...extras,
});

test('N3 canaries find terminal timers and malformed running/paused transitions', () => {
  const findings = run([
    order('ot-completed', { status: 'completed', timer_status: 'running', timer_start_time: NOW }),
    order('ot-no-start', { timer_status: 'running' }),
    order('ot-paused', { timer_status: 'paused', timer_start_time: NOW }),
    order('ot-idle', { timer_start_time: NOW }),
  ]).findings;
  assert.deepEqual(new Set(findings.map((f) => f.code)), new Set([
    'terminal_timer_active', 'running_timer_without_valid_start', 'paused_timer_has_start', 'idle_timer_has_start',
  ]));
  assert.equal(findings[0].severity, 'P1');
  assert.equal(findings.some((f) => f.authority !== 'diagnostic_read_only'), false);
});

test('the same technician cannot have two running timers without a signal', () => {
  const result = run([
    order('ot-a', { timer_status: 'running', timer_start_time: NOW, assigned_person_id: 'person-1' }),
    order('ot-b', { timer_status: 'running', timer_start_time: NOW, assigned_person_id: 'person-1' }),
    order('ot-c', { timer_status: 'running', timer_start_time: NOW, assigned_person_id: 'person-2' }),
  ]);
  assert.equal(result.findings.filter((f) => f.code === 'concurrent_running_work_orders').length, 1);
  assert.equal(result.status, 'needs_action');
  assert.equal(result.findings.some((f) => JSON.stringify(f).includes('person-1')), false);
});

test('normally paused, idle and distinct running orders are not incidents', () => {
  const result = run([
    order('paused', { timer_status: 'paused' }),
    order('idle', { status: 'completed', timer_status: 'idle' }),
    order('run', { timer_status: 'running', timer_start_time: NOW, assigned_person_id: 'person-1' }),
  ]);
  assert.equal(result.status, 'no_issues_observed');
  assert.equal(result.totalSignals, 0);
  assert.equal(result.coverage.complete, true);
});

test('a pending physical count is NOT an inventory error or a blocker', () => {
  const result = run([order('ot-1')]);
  assert.deepEqual(result.findings, []);
  assert.equal(result.policy.noStockAutoAdjustment, true);
  assert.equal(result.policy.noAutomatedClose, true);
  assert.equal(result.policy.notAlwaysOn, true);
});

test('stale or missing Laudus evidence becomes a scoped, non-mutating signal', () => {
  const stale = run([order('ot-1')], { stockSource: { state: 'observed', syncedAt: '2026-11-20T06:00:00Z' } });
  assert.equal(stale.findings[0].code, 'warehouse_source_stale');
  assert.equal(stale.findings[0].severity, 'P2');
  const missing = run([], { stockSource: { state: 'unavailable' } });
  assert.equal(missing.findings[0].code, 'warehouse_source_unavailable');
  assert.equal(missing.findings[0].severity, 'P1');
  const noPrivilege = run([], { stockSource: { state: 'not_authorized' } });
  assert.equal(noPrivilege.findings.length, 0, 'No grant is not an incident or invitation to access Bodega');
  assert.equal(noPrivilege.coverage.stockSourceChecked, false);
});

test('repeated real scoped core errors are grouped by code without raw prompts', () => {
  const errors = [
    { error_code: 'canonical_source_contract_failure', created_at: NOW },
    { error_code: 'canonical_source_contract_failure', created_at: NOW },
    { error_code: 'ai_upstream_failure', created_at: NOW },
    { error_code: 'ai_upstream_failure', created_at: NOW },
    { error_code: 'ai_upstream_failure', created_at: NOW },
    { error_code: 'ai_upstream_failure', created_at: '2026-11-20T01:00:00Z' },
  ];
  const result = run([], { coreErrorSource: { state: 'observed', rows: errors } });
  assert.equal(result.findings.length, 2);
  assert.equal(result.findings[0].severity, 'P1');
  assert.equal(result.findings[1].severity, 'P2');
  assert.equal(result.findings.every((f) => !('prompt' in f.evidence)), true);
});

test('partial population or diagnostics cannot incorrectly say healthy', () => {
  const partial = run([order('ot-1')], { totalWorkOrders: 90 });
  assert.equal(partial.coverage.complete, false);
  assert.ok(partial.findings.some((f) => f.code === 'work_order_scan_partial'));
  assert.notEqual(partial.status, 'no_issues_observed');
  const unavailable = run([], { coreErrorSource: { state: 'unavailable' } });
  assert.equal(unavailable.coverage.coreErrorsChecked, false);
  assert.ok(unavailable.findings.some((f) => f.code === 'core_error_source_unavailable'));
  const truncated = run([], { coreErrorSource: { state: 'observed', rows: [], truncated: true } });
  assert.equal(truncated.coverage.coreErrorsChecked, false);
  assert.ok(truncated.findings.some((f) => f.code === 'core_error_scan_partial'));
});

test('stable keys deduplicate multiple rechecks and bounded output preserves severity', () => {
  const rows = Array.from({ length: 12 }, (_, i) =>
    order('ot-' + i, { timer_status: 'running', timer_start_time: null }));
  const a = run(rows);
  const b = run(rows);
  assert.deepEqual(a.findings.map((f) => f.key), b.findings.map((f) => f.key));
  assert.equal(a.findings.length, 8);
  assert.equal(a.totalSignals, 12);
  assert.equal(a.truncated, true);
});

test('a late P1 cannot disappear behind eight earlier P2 observations', () => {
  const minor = Array.from({ length: 8 }, (_, i) =>
    order('old-' + i, { timer_status: 'idle', timer_start_time: NOW }));
  const lateCritical = order('very-late', { status: 'completed', timer_status: 'running', timer_start_time: NOW });
  const result = run([...minor, lateCritical], { maxFindings: 8 });
  assert.equal(result.totalSignals, 9);
  assert.equal(result.findings.length, 8);
  assert.equal(result.truncated, true);
  assert.equal(result.status, 'needs_action');
  assert.equal(result.findings[0].severity, 'P1');
  assert.equal(result.findings[0].code, 'terminal_timer_active');
  const missingSource = run(minor, { stockSource: { state: 'unavailable' }, maxFindings: 8 });
  assert.equal(missingSource.status, 'needs_action');
  assert.equal(missingSource.findings[0].code, 'warehouse_source_unavailable');
});

test('API and cockpit enforce scoped read-only contracts and passive on-open detection', () => {
  const route = readFileSync(resolve(process.cwd(), 'app/api/intelligence/maintenance-guardrails/route.ts'), 'utf8');
  const ui = readFileSync(resolve(process.cwd(), 'components/maintenance/n3-operational-guardrails.tsx'), 'utf8');
  const home = readFileSync(resolve(process.cwd(), 'components/dashboard/maintenance-home.tsx'), 'utf8');
  const closeApi = readFileSync(resolve(process.cwd(), 'app/api/maintenance/work-orders/[id]/close/route.ts'), 'utf8');
  assert.match(route, /getOrganizationContext\(request\)/);
  assert.match(route, /canReviewMaterialAttention\(viewerMode, accessLevel\)/);
  assert.match(route, /if \(!admin && !canReviewMaterialAttention/);
  assert.match(route, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(route, /MAX_WORK_ORDERS = 1000/);
  assert.match(route, /MAX_CORE_ERRORS = 100/);
  assert.match(route, /Cache-Control': 'private, no-store'/);
  assert.doesNotMatch(route, /\.update\(|\.insert\(|\.delete\(|\.upsert\(|\.rpc\(/);
  assert.match(home, /showArielCockpit \? <N3OperationalGuardrails/);
  assert.match(ui, /refreshInterval: 600_000/);
  assert.match(ui, /shouldRetryOnError: false/);
  assert.match(ui, /const urgent = data\.findings\.filter/);
  assert.match(ui, /<details/);
  assert.match(closeApi, /requireAssignedMaintenanceExecution/);
  assert.match(closeApi, /isFluidClosureDeclarationCurrent/);
  assert.match(closeApi, /evidence_type', 'photo'/);
});
