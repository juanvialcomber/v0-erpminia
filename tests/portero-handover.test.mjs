import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import { planPorteroHandover, summarizePortero } from '../lib/intake/portero.mjs';

const base = { source_identity: 'gmail:message:attachment', source_version: 'hash-a', section: 'maintenance',
  owner_name: 'Planificación', work_state: 'human_review', original_verified: true,
  scope: 'Preservar y derivar el reporte', next_action: 'Validar fecha', reopen_when: 'Corrección del responsable' };

test('a second identical pass preserves the record and emits no new handover', () => {
  const first = planPorteroHandover(base, null, '2026-10-26T10:00:00Z');
  const second = planPorteroHandover(base, first.handover, '2026-10-26T11:00:00Z');
  assert.equal(first.changed, true); assert.equal(second.changed, false);
  assert.equal(second.handover, first.handover);
  assert.equal(first.handover.receipt_status, 'not_acknowledged');
  assert.equal(first.handover.notification_status, 'not_sent');
});
test('new source bytes reopen evaluation without altering approval or losing the previous version', () => {
  const first = planPorteroHandover(base).handover;
  const next = planPorteroHandover({ ...base, source_version: 'hash-b' }, first);
  assert.equal(next.changed, true);
  assert.equal(next.handover.previous_fingerprint, first.fingerprint);
  assert.equal(next.handover.canonical_approved, false);
});
test('missing originals cannot be marked processed or handed to a reviewer as complete evidence', () => {
  assert.throws(() => planPorteroHandover({ ...base, original_verified: false }), /missing_review_evidence/);
  assert.throws(() => planPorteroHandover({ ...base, work_state: 'processed' }), /unverified_completion/);
  assert.equal(planPorteroHandover({ ...base, original_verified: false, work_state: 'blocked' }).handover.automatic_closed, true);
});
test('human review and exhausted failures do not remain in the automatic work queue', () => {
  const s = summarizePortero([{ work_state: 'processed' }, { work_state: 'human_review' }, { work_state: 'blocked' }]);
  assert.equal(s.automaticEmpty, true); assert.equal(s.humanReview, 1); assert.equal(s.blocked, 1);
  assert.equal(s.automaticOpen, 0);
});
test('future retries are deferred; due retries become executable; unknown work never becomes a false empty queue', () => {
  const s = summarizePortero([{ work_state: 'retry_scheduled', next_attempt_at: '2026-10-26T12:30:00Z' },
    { work_state: 'retry_scheduled', next_attempt_at: '2026-10-26T11:30:00Z' }, { work_state: 'catalogued' }], Date.parse('2026-10-26T12:00:00Z'));
  assert.equal(s.deferred, 1); assert.equal(s.readyNow, 1); assert.equal(s.unclassified, 1); assert.equal(s.automaticEmpty, false);
  assert.throws(() => planPorteroHandover({ ...base, work_state: 'retry_scheduled', attempts_left: 0 }), /invalid_retry/);
});

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const routeSource = await readFile(new URL('../app/api/intake/handovers/route.ts', import.meta.url), 'utf8');
const routeCode = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function route({ role = 'viewer', allowed = true, error = null, rows = [], tableRows = {} } = {}) {
  const calls = []; const moduleCalls = [];
  const db = { from(table) {
    const call = { table, filters: [] }; calls.push(call);
    const chain = { select(value) { call.select = value; return chain; },
      eq(key, value) { call.filters.push([key, value]); return chain; },
      order() { return chain; }, limit(value) { call.limit = value; return chain; },
      in(key, value) { call.filters.push([key, value]); return chain; },
      contains(key, value) { call.filters.push([key, value]); return chain; },
      then(resolve, reject) { return Promise.resolve({ data: tableRows[table] || rows, error }).then(resolve, reject); } };
    return chain;
  } };
  const exports = {};
  const modules = {
    'next/server': { NextResponse },
    '@/lib/api/organization-context': { getOrganizationContext: async () => ({ ok: true, organizationId: 'tenant-a', role, supabase: db }) },
    '@/lib/api/module-access': { MODULE_KEYS: { MANT_OPERACIONES: 'mant', PROD_OPERACIONES: 'prod', FIN_FINANZAS: 'finance', HSE_TABLERO: 'hse' },
      isAdminRole: r => r === 'superadmin' || r === 'admin',
      requireModuleAccess: async (_request, key) => { moduleCalls.push(key); return { authorized: allowed, response: NextResponse.json({ error: 'denied' }, { status: 403 }) }; } },
    '@/lib/intake/portero.mjs': { summarizePortero },
  };
  runInNewContext(routeCode, { require: name => { if (!(name in modules)) throw new Error(name); return modules[name]; }, exports });
  return { GET: exports.GET, calls, moduleCalls };
}

test('a finance viewer cannot read technical blocked attachments', async () => {
  const r = route(); const response = await r.GET(new NextRequest('https://motil.example/api/intake/handovers?section=data_health'));
  assert.equal(response.status, 403); assert.equal(r.calls.length, 0);
});
test('module denial and inherited property names cannot expose handovers', async () => {
  const r = route({ allowed: false });
  assert.equal((await r.GET(new NextRequest('https://motil.example/api/intake/handovers?section=finance'))).status, 403);
  assert.equal((await r.GET(new NextRequest('https://motil.example/api/intake/handovers?section=toString'))).status, 400);
  assert.equal(r.calls.length, 0);
});
test('section reads require its module, remain tenant-scoped and bounded, and mark truncation', async () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ id: String(i), filename: 'source.xlsx', handover: { work_state: 'human_review' } }));
  const r = route({ rows }); const response = await r.GET(new NextRequest('https://motil.example/api/intake/handovers?section=finance'));
  const payload = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(r.moduleCalls, ['finance']);
  assert.equal(payload.rows.length, 50); assert.equal(payload.truncated, true);
  assert.equal(payload.coverage, 'registered_handoffs_only');
  assert.ok(r.calls.every(c => c.limit === 51 && c.filters.some(([key, value]) => key === 'organization_id' && value === 'tenant-a')));
  assert.match(r.calls[0].select, /handover:source_profile->portero/);
  assert.ok(!r.calls[0].select.includes('source_profile,'));
});
test('read failure cannot be represented as no pending work', async () => {
  const r = route({ error: { code: 'db_failed' } });
  const response = await r.GET(new NextRequest('https://motil.example/api/intake/handovers?section=maintenance'));
  assert.equal(response.status, 503); assert.ok(!(await response.json()).summary);
});
test('WhatsApp findings are distributed only to the section with current enabled source evidence', async () => {
  const r = route({ tableRows: {
    motil_email_source_manifest: [], motil_whatsapp_groups: [{ id: 'enabled-group' }],
    motil_whatsapp_daily_reports: [{ id: 'daily', report_date: '2026-10-25', findings: [
      { detail: 'Planta', source_ids: [1], portero: { section: 'production', source_identity: 'valid', work_state: 'human_review' } },
      { detail: 'No autorizado', source_ids: [2], portero: { section: 'production', source_identity: 'disabled', work_state: 'human_review' } },
      { detail: 'HSE', source_ids: [1], portero: { section: 'hse', source_identity: 'other-section', work_state: 'human_review' } },
    ] }], motil_whatsapp_messages: [{ id: 1 }],
  } });
  const response = await r.GET(new NextRequest('https://motil.example/api/intake/handovers?section=production'));
  const body = await response.json();
  assert.equal(response.status, 200); assert.deepEqual(body.rows.map(x => x.id), ['valid']);
  assert.deepEqual(r.moduleCalls, ['prod']);
  const messages = r.calls.find(x => x.table === 'motil_whatsapp_messages');
  assert.ok(messages.filters.some(([key, value]) => key === 'organization_id' && value === 'tenant-a'));
  assert.ok(messages.filters.some(([key, value]) => key === 'group_id' && value[0] === 'enabled-group'));
  assert.equal(messages.limit, 50);
});
